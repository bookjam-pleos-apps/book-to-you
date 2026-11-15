import type { ReactNode } from "react";

import { micHelpFor } from "../../../lib/browser/mic-help";
import { fileExtensionFor } from "../../../lib/recorder/recording-format";
import { canPlayAudio, type RecordedClip, type RecorderState } from "../../../lib/recorder/recorder-state";
import { useRecorder, type Recorder } from "../../../lib/recorder/use-recorder";
import { ProblemAlert } from "../../../shared/ui/alert";
import { Dock } from "../../../shared/ui/screen";
import { Hint } from "../../../shared/ui/text";
import { CoachingAlert, CoachingChoice, type Coaching } from "./coaching";
import { RecordButton, RecordingNow } from "./record-controls";
import { Review } from "./record-review";
import type { Feedback } from "./recording-feedback";
import { autoStopMs, durationHint, limitFor, type RecordingKind } from "./recording-limits";
import { takeProblem } from "./take-check";
import type { CheckedUpload } from "./use-checked-upload";

type PanelProps = {
  readonly kind: RecordingKind;
  readonly upload: CheckedUpload;
  // 새로 녹음을 시작할 때 화면이 따로 할 일(동의 단계는 탈락 뒤 새 문장을 받는다).
  readonly onStartAgain?: () => void;
  // 참이면 녹음 버튼을 보이되 꺼 둔다(본인 확인 체크 전). 버튼이 보이니 따로 안내하지 않는다.
  readonly locked: boolean;
  // 통과했지만 코칭이 붙은 녹음에 보일 권유다. 코칭이 없는 녹음 종류(낭독 확인, 안내 음성)는 주지 않는다.
  readonly coaching?: Coaching;
  // 경고 상자와 녹음 버튼 사이에 놓이는 대본 카드 등이다.
  readonly children: ReactNode;
};

const toAudioFile = (clip: RecordedClip, kind: RecordingKind): File =>
  new File([clip.blob], `${kind}.${fileExtensionFor(clip.blob.type)}`, { type: clip.blob.type });

// 거부 안내는 기기마다 길이 달라 그때 그 기기의 UA로 만든다.
const microphoneProblem = (kind: RecorderState["kind"]): Feedback | null => {
  if (kind === "denied") return { title: "마이크를 쓸 수 없어요", body: micHelpFor(navigator.userAgent) };
  if (kind === "failed") return { title: "마이크를 열지 못했어요", body: "다른 앱이 마이크를 쓰고 있는지 확인해 주세요." };
  return null;
};

// 경고는 한 번에 하나만 보인다. 마이크 문제, 방금 녹음의 문제, 서버 거절 순서다.
const panelProblem = (state: RecorderState, props: PanelProps): Feedback | null => {
  const microphone = microphoneProblem(state.kind);
  if (microphone !== null) return microphone;
  const take = state.kind === "released" ? takeProblem(props.kind, state.clip) : null;
  if (take !== null) return take;
  // 서버 거절 문구는 방금 올린 녹음의 결과다. 다시 녹음을 시작하면 결과를 지우므로 함께 사라진다.
  return canPlayAudio(state) ? props.upload.feedback : null;
};

type DockProps = { readonly recorder: Recorder; readonly props: PanelProps; readonly coaching: Coaching | null; readonly startAgain: () => void };

type ReleasedProps = { readonly clip: RecordedClip; readonly props: PanelProps; readonly startAgain: () => void };

// 방금 올린 녹음이 코칭과 함께 통과했다. 녹음이 화면에 남아 있어 다시 들어 볼 수 있다.
const coachingShown = (state: RecorderState, { upload, coaching }: PanelProps): Coaching | null =>
  upload.advised && coaching !== undefined && state.kind === "released" ? coaching : null;

const ReleasedReview = ({ clip, startAgain, props }: ReleasedProps) => (
  <Review
    clip={clip}
    blocked={props.locked || takeProblem(props.kind, clip) !== null}
    retakeOnly={props.upload.retake}
    uploading={props.upload.uploading}
    onRetake={startAgain}
    onUpload={() => props.upload.upload(toAudioFile(clip, props.kind))}
  />
);

const DockBody = ({ recorder, props, coaching, startAgain }: DockProps) => {
  const { state } = recorder;
  if (state.kind === "recording") {
    return <RecordingNow elapsedMs={recorder.elapsedMs} maxMs={limitFor(props.kind).maxMs} level={recorder.level} onStop={recorder.stop} />;
  }
  if (state.kind === "released" && coaching !== null) return <CoachingChoice clip={state.clip} onRetake={startAgain} onSkip={coaching.onSkip} />;
  if (state.kind === "released") return <ReleasedReview clip={state.clip} startAgain={startAgain} props={props} />;
  if (state.kind === "acquiring" || state.kind === "ready" || state.kind === "recorded") return <Hint>마이크를 준비하고 있어요…</Hint>;
  const again = props.upload.feedback !== null || state.kind !== "idle";
  return <RecordButton onStart={startAgain} label={again ? "다시 녹음" : "녹음 시작"} hint={durationHint(props.kind)} disabled={props.locked} />;
};

export const RecordPanel = (props: PanelProps) => {
  const recorder = useRecorder(autoStopMs(props.kind));
  const problem = panelProblem(recorder.state, props);
  const coaching = coachingShown(recorder.state, props);
  const startAgain = () => {
    props.onStartAgain?.();
    props.upload.reset();
    recorder.start();
  };
  return (
    <>
      {problem === null ? null : <ProblemAlert title={problem.title} body={problem.body} />}
      {coaching === null ? null : <CoachingAlert feedback={coaching.feedback} />}
      {props.children}
      <Dock>
        <DockBody recorder={recorder} props={props} coaching={coaching} startAgain={startAgain} />
      </Dock>
    </>
  );
};
