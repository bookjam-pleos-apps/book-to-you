import { mapInSequence } from "../../domain/in-sequence";
import { hangulSyllables } from "../../domain/stories/readable-text";
import { judgeClipReading } from "../../domain/voices/recording-match";
import { ANCHOR_STYLE, isDistinctFromEvery, prosodyOf, type Prosody } from "../../domain/voices/style-check";
import { findClipScript } from "../recording-scripts";
import type { AnchorClip, ClipAwaitingCheck, ClipReading, ClipVerdict } from "./ports";
import { discardObject, readObjectOrNull, settledOutcome, type VerifyDeps, type VerifyOutcome } from "./verify-recording";

// 대본이나 객체가 사라져 확인할 수 없는 녹음이다. 아무리 다시 확인해도 소용없어 탈락시킨다.
const UNCHECKABLE: ClipVerdict = { status: "failed", errorRate: null, prosody: null, failure: null, advice: null };

const passed = (reading: ClipReading): ClipVerdict => ({ status: "passed", ...reading, failure: null, advice: null });

// 평소 목소리(calm)와 구별되지 않아도 막지 않는다. 통과시키고 웹이 더 잘 읽는 법을 알린다.
const passedWithCoaching = (reading: ClipReading): ClipVerdict => ({ ...passed(reading), advice: "not_distinct" });

const isVerdict = (result: ClipVerdict | ClipReading): result is ClipVerdict => "status" in result;

const isMeasured = (prosody: Prosody | null): prosody is Prosody => prosody !== null;

// 정해진 판정이 있으면 지우지 않는다. 먼저 끝난 확인이 통과시킨 클립의 객체를 뒤늦은 탈락이 지우면 안 된다.
const settleClip = async (deps: VerifyDeps, clipId: string, clip: ClipAwaitingCheck, verdict: ClipVerdict): Promise<VerifyOutcome> => {
  const settled = await deps.clips.settle(clipId, verdict);
  if (settled && verdict.status === "failed") await discardObject(deps, clip.storageKey);
  return settledOutcome(settled, verdict.status === "passed");
};

type RecordedScript = Pick<ClipAwaitingCheck, "scriptId" | "scriptVersion" | "storageKey">;

type AnalyzedRecording = { readonly scriptText: string; readonly transcript: string; readonly prosody: Prosody };

// 대본이나 객체가 사라졌으면 null이다. 받아쓰기와 측정을 한 번에 한다.
const analyzeRecording = async (deps: VerifyDeps, recorded: RecordedScript): Promise<AnalyzedRecording | null> => {
  const script = findClipScript(deps.scripts, recorded.scriptId, recorded.scriptVersion);
  if (script === undefined) return null;
  const wav = await readObjectOrNull(deps, recorded.storageKey);
  if (wav === null) return null;
  const { transcript, measure } = await deps.analyzer.analyze(wav);
  return { scriptText: script.text, transcript, prosody: prosodyOf(measure, hangulSyllables(script.text)) };
};

// 분석이 실패하면 예외가 올라가 행은 checking으로 남는다. 녹음을 잃지 않고 다시 시도할 수 있다.
const readClip = async (deps: VerifyDeps, clip: ClipAwaitingCheck): Promise<ClipVerdict | ClipReading> => {
  const analyzed = await analyzeRecording(deps, clip);
  if (analyzed === null) return UNCHECKABLE;
  const match = judgeClipReading(analyzed.scriptText, analyzed.transcript, deps.maxErrorRate);
  const reading = { errorRate: match.errorRate, prosody: analyzed.prosody };
  return match.passed ? reading : { status: "failed", ...reading, failure: "script_mismatch", advice: null };
};

// 이 검사가 생기기 전에 통과한 calm은 측정값이 없다. 한 번 재서 남긴다. 잴 수 없으면 기준점으로 쓰지 않는다.
const measureAnchor = async (deps: VerifyDeps, anchor: AnchorClip): Promise<Prosody | null> => {
  const analyzed = await analyzeRecording(deps, anchor);
  if (analyzed === null) return null;
  await deps.clips.recordProsody(anchor.id, analyzed.prosody);
  return analyzed.prosody;
};

const anchorProsodies = async (deps: VerifyDeps, voiceId: string): Promise<readonly Prosody[]> => {
  const anchors = await deps.clips.passedAnchors(voiceId);
  const measured = await Promise.all(anchors.map((anchor) => anchor.prosody ?? measureAnchor(deps, anchor)));
  return measured.filter(isMeasured);
};

// 통과한 calm이 없으면 판정하지 않는다. 측정값을 먼저 남기고 calm을 찾아야, calm이 그사이 통과해도 둘 중 한쪽이 반드시 판정한다.
const judgeAgainstCalm = async (deps: VerifyDeps, clipId: string, clip: ClipAwaitingCheck, reading: ClipReading): Promise<ClipVerdict | null> => {
  const check = deps.scripts.styleChecks.find(({ style }) => style === clip.style);
  if (check === undefined) return passed(reading);
  if (clip.reading === null) await deps.clips.recordReading(clipId, reading);
  const calms = await anchorProsodies(deps, clip.voiceId);
  if (calms.length === 0) return null;
  return isDistinctFromEvery(check, calms, reading.prosody) ? passed(reading) : passedWithCoaching(reading);
};

export const verifyClip =
  (deps: VerifyDeps) =>
  async (clipId: string): Promise<VerifyOutcome> => {
    const clip = await deps.clips.findChecking(clipId);
    if (clip === null) return "skipped";
    const reading = clip.reading ?? (await readClip(deps, clip));
    if (isVerdict(reading)) return settleClip(deps, clipId, clip, reading);
    const verdict = await judgeAgainstCalm(deps, clipId, clip, reading);
    if (verdict === null) return "waiting";
    const outcome = await settleClip(deps, clipId, clip, verdict);
    if (outcome === "passed" && clip.style === ANCHOR_STYLE) await judgeClipsAwaiting(deps, clip.voiceId);
    return outcome;
  };

// calm이 통과하면 기다리던 녹음을 저장된 측정값으로 판정한다. 기다리는 녹음은 calm이 아니라 여기서 다시 돌아오지 않는다.
// 하나씩 판정한다. 측정값 없는 옛 calm을 녹음마다 겹쳐 재지 않는다. 판정이 실패한 녹음은 checking으로 남아 다시 확인되고,
// 이미 확정된 calm의 결과를 되돌리지 않는다.
const judgeClipsAwaiting = async (deps: VerifyDeps, voiceId: string): Promise<void> => {
  const waiting = await deps.clips.idsAwaitingAnchor(voiceId);
  const report = (clipId: string) => (error: unknown) => deps.reportFailure(`clip ${clipId} awaiting calm`, error);
  await mapInSequence(waiting, (clipId) => verifyClip(deps)(clipId).catch(report(clipId)));
};
