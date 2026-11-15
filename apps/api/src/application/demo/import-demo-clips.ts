import type { ClipAdvice, Style } from "@voice-storybook/shared/vocab";

import { mapInSequence } from "../../domain/in-sequence";
import type { RecordingScripts } from "../recording-scripts";
import type { ClipSummary, UploadClipInput, UploadClipResult, VoiceRepo } from "../voices";
import { findDemoVoice } from "./demo-voice";

// 운영자가 가진 녹음 파일을 데모 목소리의 클립으로 올린다. 부모 업로드와 같은 검사·저장·녹음 확인을 거친다.
export type DemoClipFile = { readonly style: Style; readonly audio: Uint8Array };

export type DemoClipOutcome =
  | { readonly style: Style; readonly kind: "checking" | "waiting_for_calm"; readonly clipId: string }
  | { readonly style: Style; readonly kind: "passed"; readonly clipId: string; readonly advice: ClipAdvice | null }
  | { readonly style: Style; readonly kind: "failed"; readonly clipId: string; readonly failure: string | null }
  | { readonly style: Style; readonly kind: "already_recorded" | "no_script" }
  | { readonly style: Style; readonly kind: "refused"; readonly detail: string };

export type ImportDemoClipsResult =
  | { readonly kind: "imported"; readonly voiceId: string; readonly clips: readonly DemoClipOutcome[] }
  | { readonly kind: "no_single_voice"; readonly voices: number }
  | { readonly kind: "duplicate_style"; readonly styles: readonly Style[] };

export type ImportDemoClipsDeps = {
  readonly voices: Pick<VoiceRepo, "list">;
  readonly scripts: RecordingScripts;
  readonly uploadClip: (input: UploadClipInput) => Promise<UploadClipResult>;
};

// 같은 style에 통과했거나 확인 중인 녹음이 있으면 렌더가 참조를 고르지 못한다(ambiguous_clip).
const hasLiveClip = (clips: readonly ClipSummary[], style: Style): boolean =>
  clips.some((clip) => clip.style === style && clip.status !== "failed");

// calm 말고 다른 style은 통과한 calm과 비교해야 판정된다. calm이 없어 멈춘 것은 따로 알린다.
const checkingOf = (style: Style, clipId: string, calmPassed: boolean): DemoClipOutcome =>
  style !== "calm" && !calmPassed ? { style, kind: "waiting_for_calm", clipId } : { style, kind: "checking", clipId };

const outcomeOf = (style: Style, clip: ClipSummary | undefined, clipId: string, calmPassed: boolean): DemoClipOutcome => {
  if (clip === undefined || clip.status === "checking") return checkingOf(style, clipId, calmPassed);
  if (clip.status === "passed") return { style, kind: "passed", clipId, advice: clip.advice };
  return { style, kind: "failed", clipId, failure: clip.failure };
};

const refusedOf = (style: Style, result: Exclude<UploadClipResult, { readonly kind: "checking" }>): DemoClipOutcome => ({
  style,
  kind: "refused",
  detail: result.kind === "rejected" ? `rejected: ${result.reasons.join(", ")}` : result.kind,
});

type Target = { readonly userId: string; readonly voiceId: string; readonly calmPassed: boolean };

const importOne = async (deps: ImportDemoClipsDeps, target: Target, file: DemoClipFile): Promise<DemoClipOutcome> => {
  // 웹 녹음 화면(apps/web script-step.tsx)과 같이 style의 첫 대본을 읽은 것으로 본다. 지금은 style마다 대본이 하나다.
  const script = deps.scripts.clips.find((candidate) => candidate.style === file.style);
  if (script === undefined) return { style: file.style, kind: "no_script" };
  const input = { userId: target.userId, voiceId: target.voiceId, style: file.style, scriptId: script.id, scriptVersion: script.version, upload: file.audio };
  const result = await deps.uploadClip(input);
  if (result.kind !== "checking") return refusedOf(file.style, result);
  const voice = (await deps.voices.list(target.userId)).find(({ id }) => id === target.voiceId);
  return outcomeOf(file.style, voice?.clips.find(({ id }) => id === result.clipId), result.clipId, target.calmPassed);
};

// style 검사(deep·child·soft)는 통과한 calm과 비교한다. calm을 먼저 올려야 나머지가 "판정 대기"로 남지 않는다.
const calmFirst = (files: readonly DemoClipFile[]): readonly DemoClipFile[] => [
  ...files.filter(({ style }) => style === "calm"),
  ...files.filter(({ style }) => style !== "calm"),
];

// 같은 style을 두 번 올리면 둘 다 통과할 수 있고, 그러면 렌더가 참조를 고르지 못한다. 시작 전에 막는다.
const duplicateStyles = (files: readonly DemoClipFile[]): readonly Style[] =>
  [...new Set(files.map(({ style }) => style).filter((style, index, all) => all.indexOf(style) !== index))];

const calmPassedIn = (clips: readonly ClipSummary[], done: readonly DemoClipOutcome[]): boolean =>
  clips.some(({ style, status }) => style === "calm" && status === "passed") ||
  done.some(({ style, kind }) => style === "calm" && kind === "passed");

// 녹음 확인은 업로드 안에서 끝난다(inline verify). 그래서 한 개씩 차례로 올린다.
export const importDemoClips =
  (deps: ImportDemoClipsDeps) =>
  async (userId: string, files: readonly DemoClipFile[]): Promise<ImportDemoClipsResult> => {
    const duplicates = duplicateStyles(files);
    if (duplicates.length > 0) return { kind: "duplicate_style", styles: duplicates };
    const lookup = await findDemoVoice(deps.voices, userId);
    if (lookup.kind !== "found") return lookup;
    const { voice } = lookup;
    const clips = await mapInSequence(calmFirst(files), async (file, done: readonly DemoClipOutcome[]): Promise<DemoClipOutcome> => {
      if (hasLiveClip(voice.clips, file.style)) return { style: file.style, kind: "already_recorded" };
      const target = { userId, voiceId: voice.id, calmPassed: calmPassedIn(voice.clips, done) };
      return importOne(deps, target, file);
    });
    return { kind: "imported", voiceId: voice.id, clips };
  };
