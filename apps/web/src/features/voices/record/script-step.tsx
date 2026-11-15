import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import type { Style } from "@voice-storybook/shared/vocab";
import { useState } from "react";

import { ProblemAlert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { PendingLoads } from "../../../shared/ui/pending-loads";
import { Dock } from "../../../shared/ui/screen";
import { Notice, ScriptCard } from "../../../shared/ui/surfaces";
import { Body, Lead, Title } from "../../../shared/ui/text";
import { CoachingAlert, SkipButton } from "./coaching";
import { RecordPanel } from "./record-panel";
import { clipFailureFeedback, coachingFor, earlierClipFailure, isCoaching, type Feedback } from "./recording-feedback";
import { optionalStepTitle, STEP_TITLES } from "../step-titles";
import { clipOutcome } from "./upload-outcome";
import { useCheckedUpload, type CheckedUpload } from "./use-checked-upload";
import { clipStatusOf, optionalStyleToOffer } from "../voice-steps";
import { uploadClip, uploadPrompt, useRecordingScripts, type RecordingScripts, type ScriptRef } from "../voices-api";

type ScriptCardData = ScriptRef & { readonly direction: string; readonly text: string };

const findScript = (scripts: RecordingScripts, step: Style | "belt"): ScriptCardData | undefined =>
  step === "belt"
    ? scripts.prompts.find((prompt) => prompt.kind === "belt_unfastened")
    : scripts.clips.find((clip) => clip.style === step);

type StepProps = {
  readonly voice: VoiceResponse;
  readonly step: Style | "belt";
  readonly onNext: () => void;
  readonly nextLabel?: string;
};

const sendFor = (voiceId: string, step: Style | "belt", script: ScriptRef) => async (audio: File): Promise<string> =>
  step === "belt"
    ? (await uploadPrompt(voiceId, "belt_unfastened", script, audio)).id
    : (await uploadClip(voiceId, step, script, audio)).id;

// 안내 음성은 신호 QC만 거치고 대본 일치는 확인하지 않는다. 저장되면 끝이다.
const judgeFor = (step: Style | "belt") => (step === "belt" ? () => "passed" as const : clipOutcome);

// 방금 올린 녹음이 탈락한 이유다.
const failedFeedbackFor = (style: Style) => (voice: VoiceResponse, clipId: string): Feedback =>
  clipFailureFeedback(style, voice.clips.find((clip) => clip.id === clipId)?.failure ?? null);

// 안내 음성은 확인에서 탈락하지 않아 이유를 찾지 않는다.
const useStepUpload = ({ voice, step, onNext }: StepProps, script: ScriptRef) =>
  useCheckedUpload({
    voiceId: voice.id,
    send: sendFor(voice.id, step, script),
    judge: judgeFor(step),
    ...(step === "belt" ? {} : { failedFeedback: failedFeedbackFor(step) }),
    onPassed: onNext,
  });

type CheckingProps = { readonly text: string; readonly nextLabel: string; readonly onNext: () => void };

const CheckingNotice = ({ text, nextLabel, onNext }: CheckingProps) => (
  <>
    <ScriptCard>{text}</ScriptCard>
    <Notice>대본과 맞는지 확인하고 있어요. 확인되면 목소리 화면에 보여요.</Notice>
    <Dock>
      <Button className="w-full" onClick={onNext}>
        {nextLabel}
      </Button>
    </Dock>
  </>
);

// 아직 녹음하지 않은 선택 녹음만 "(선택)"이다. 실패해서 다시 받는 녹음은 준비되려면 꼭 필요하다.
// 올린 뒤 상태가 바뀌어도 제목이 흔들리지 않게 들어올 때 정한다.
const useStepTitle = (voice: VoiceResponse, step: Style | "belt"): string => {
  const [offer] = useState(() => optionalStyleToOffer(voice));
  return offer === step ? optionalStepTitle(offer) : STEP_TITLES[step];
};

type RecorderProps = StepProps & { readonly script: ScriptCardData };

// 코칭을 받고 다시 읽은 녹음이 거절돼도 앞선 녹음이 통과해 있다. 갇히지 않게 넘어갈 길을 함께 둔다.
const canSkipRetake = ({ voice, step }: StepProps, upload: CheckedUpload): boolean =>
  step !== "belt" && upload.retake && clipStatusOf(voice, step) === "passed";

const coachingOf = ({ step, onNext }: StepProps) => (step === "belt" ? {} : { coaching: { feedback: coachingFor(step), onSkip: onNext } });

// 이 화면에 다시 들어온 경우의 안내다. 예전 기준에서 구별되지 않아 탈락한 녹음은 권유로 보인다.
const EarlierNotice = ({ style, feedback }: { readonly style: Style; readonly feedback: Feedback }) =>
  isCoaching(style, feedback) ? <CoachingAlert feedback={feedback} /> : <ProblemAlert title={feedback.title} body={feedback.body} />;

const StepBody = ({ script, upload, ...props }: RecorderProps & { readonly upload: CheckedUpload }) => {
  const { voice, step, onNext, nextLabel = "다음으로" } = props;
  if (upload.checking) return <CheckingNotice text={script.text} nextLabel={nextLabel} onNext={onNext} />;
  const earlier = step === "belt" ? null : earlierClipFailure(voice, step);
  return (
    <>
      <RecordPanel kind={step === "belt" ? "prompt" : "clip"} upload={upload} locked={false} {...coachingOf(props)}>
        {/* 방금 올린 결과는 녹음 패널이 보여 주므로 겹쳐 띄우지 않는다. */}
        {step !== "belt" && earlier !== null && upload.feedback === null ? <EarlierNotice style={step} feedback={earlier} /> : null}
        <ScriptCard>{script.text}</ScriptCard>
      </RecordPanel>
      {canSkipRetake(props, upload) ? <SkipButton onSkip={onNext} /> : null}
    </>
  );
};

const ScriptRecorder = ({ script, ...props }: RecorderProps) => {
  const title = useStepTitle(props.voice, props.step);
  const upload = useStepUpload(props, script);
  return (
    <>
      <Title>{title}</Title>
      <Lead>{script.direction}</Lead>
      <StepBody {...props} script={script} upload={upload} />
    </>
  );
};

export const ScriptStep = (props: StepProps) => {
  const scripts = useRecordingScripts();
  if (!scripts.data) return <PendingLoads queries={[scripts]} />;
  const script = findScript(scripts.data, props.step);
  if (script === undefined) return <Body>대본을 찾지 못했어요.</Body>;
  return <ScriptRecorder {...props} script={script} />;
};
