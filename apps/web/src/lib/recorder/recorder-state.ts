import type { MicCheckResult } from "./mic-check";
import type { MicProcessing } from "./recording-format";

export type RecordedClip = {
  readonly blob: Blob;
  readonly durationMs: number;
  // 녹음 중 가장 컸던 입력(0~1). 재지 못했으면 null이다. 마이크가 소리를 넘기지 않은 녹음을 올리기 전에 가려낸다.
  readonly peak: number | null;
  // 이 녹음을 연 마이크 처리 방식이다. 무음일 때 무엇을 안내할지 정한다.
  readonly processing: MicProcessing;
  // 처리를 끈 마이크 점검 결과다(점검하지 않았으면 null). 실기기에서 바닥값을 맞출 때 본다.
  readonly micCheck: MicCheckResult | null;
};

export type RecorderState =
  | { readonly kind: "idle" }
  | { readonly kind: "acquiring" }
  | { readonly kind: "ready" }
  | { readonly kind: "recording"; readonly startedAt: number }
  | { readonly kind: "recorded"; readonly clip: RecordedClip }
  | { readonly kind: "released"; readonly clip: RecordedClip }
  | { readonly kind: "denied" }
  | { readonly kind: "failed" };

export type RecorderEvent =
  | { readonly type: "acquire" }
  | { readonly type: "granted" }
  | { readonly type: "denied" }
  | { readonly type: "started"; readonly at: number }
  | { readonly type: "captured"; readonly blob: Blob; readonly at: number; readonly peak: number | null; readonly processing: MicProcessing; readonly micCheck: MicCheckResult | null }
  | { readonly type: "released" }
  | { readonly type: "failed" }
  | { readonly type: "reset" };

export const INITIAL_RECORDER_STATE: RecorderState = { kind: "idle" };

// 마이크가 닫혀 있는 상태다. 새 녹음은 여기서만 시작하고, 재생도 여기서만 한다.
const MIC_CLOSED: ReadonlySet<RecorderState["kind"]> = new Set(["idle", "released", "denied", "failed"]);

type Captured = Omit<Extract<RecorderEvent, { type: "captured" }>, "type">;

const afterCapture = (state: RecorderState, event: Captured): RecorderState =>
  state.kind === "recording"
    ? { kind: "recorded", clip: { blob: event.blob, durationMs: Math.max(0, event.at - state.startedAt), peak: event.peak, processing: event.processing, micCheck: event.micCheck } }
    : state;

const afterRelease = (state: RecorderState): RecorderState => {
  if (state.kind === "recorded") return { kind: "released", clip: state.clip };
  // 녹음 전에 마이크를 닫았다(권한만 받고 취소). 처음으로 돌아간다.
  if (state.kind === "acquiring" || state.kind === "ready" || state.kind === "recording") return INITIAL_RECORDER_STATE;
  return state;
};

export const transition = (state: RecorderState, event: RecorderEvent): RecorderState => {
  switch (event.type) {
    case "acquire":
      return MIC_CLOSED.has(state.kind) ? { kind: "acquiring" } : state;
    case "granted":
      return state.kind === "acquiring" ? { kind: "ready" } : state;
    case "denied":
      return state.kind === "acquiring" ? { kind: "denied" } : state;
    case "started":
      return state.kind === "ready" ? { kind: "recording", startedAt: event.at } : state;
    case "captured":
      return afterCapture(state, event);
    case "released":
      return afterRelease(state);
    case "failed":
      return { kind: "failed" };
    case "reset":
      return INITIAL_RECORDER_STATE;
  }
};

// WebKit 326286: 마이크가 열린 채 재생하면 소리가 깨진다. 마이크를 닫은 상태에서만 재생한다.
export const canPlayAudio = (state: RecorderState): boolean => MIC_CLOSED.has(state.kind);
