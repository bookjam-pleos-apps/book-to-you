import { MIC_CHECK_INTERVAL_MS, micCheckLine, micCheckVerdict, needsMicCheck, type MicCheckResult } from "./mic-check";
import type { LevelProbe } from "./level-probe";
import type { RecorderEvent } from "./recorder-state";
import { microphoneConstraints, type MicProcessing } from "./recording-format";

// 마이크 열기, 녹음기 돌리기, 처리를 끈 마이크 점검과 갈아타기다. MediaRecorder·getUserMedia는 여기와 microphone-session에만 있다.
export type Dispatch = (event: RecorderEvent) => void;

export type Session = {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  probe: LevelProbe | null;
  // 음량 측정기에서 지금 스트림을 끊는다.
  detachSource: (() => void) | null;
  // 마이크 점검 중이면 그 타이머다. 점검이 끝나야 화면에 녹음 시작을 알린다.
  checkTimer: number | null;
  // 마지막 점검 결과다. 갈아탄 뒤에도 남겨 녹음 결과에 붙인다.
  check: MicCheckResult | null;
};
export type SessionRef = { current: Session };

export const EMPTY_SESSION: Session = { stream: null, recorder: null, probe: null, detachSource: null, checkTimer: null, check: null };

// 녹음이 끝나면 곧바로 트랙을 닫는다. iOS는 마이크가 열린 채 재생하면 소리가 깨진다(WebKit 326286).
export const stopTracks = (stream: MediaStream | null): void => stream?.getTracks().forEach((track) => track.stop());

export const closeSession = (session: SessionRef): void => {
  if (session.current.checkTimer !== null) window.clearInterval(session.current.checkTimer);
  stopTracks(session.current.stream);
  session.current.probe?.close();
  session.current = EMPTY_SESSION;
};

export type TakeOptions = {
  readonly mimeType: string;
  // 녹음이 끝났을 때다. used는 실제로 쓴 마이크 처리다(갈아탔으면 browser).
  readonly onCaptured: (blob: Blob, used: MicProcessing) => void;
  // 처리를 끈 마이크가 죽어 있어 처리를 켠 마이크로 갈아탔을 때다. 다음 녹음부터 처음부터 처리를 켠다.
  readonly onSwitched: () => void;
  readonly isMounted: () => boolean;
};

const beginRecording = (stream: MediaStream, mimeType: string, onStopped: (blob: Blob) => void): MediaRecorder => {
  const chunks: Blob[] = [];
  const recorder = mimeType === "" ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = () => onStopped(new Blob(chunks, { type: recorder.mimeType }));
  recorder.start();
  return recorder;
};

// 갈아탈 때 처리를 끈 녹음은 결과를 내지 않고 버리고, 음량 측정기에서도 끊는다.
const discardTake = (session: SessionRef): void => {
  const { recorder, stream, detachSource } = session.current;
  detachSource?.();
  if (recorder !== null) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state === "recording") recorder.stop();
  }
  stopTracks(stream);
  session.current = { ...session.current, stream: null, recorder: null, detachSource: null };
};

const switchToBrowserProcessing = (dispatch: Dispatch, session: SessionRef, options: TakeOptions): void => {
  discardTake(session);
  options.onSwitched();
  navigator.mediaDevices.getUserMedia(microphoneConstraints("browser")).then(
    (stream) => (options.isMounted() ? startTake(dispatch, session, options, stream, "browser") : stopTracks(stream)),
    () => {
      // 측정기(AudioContext)를 열어 둔 채 두면 다음 녹음이 새 측정기를 또 연다. 브라우저마다 개수 한도가 있다.
      closeSession(session);
      dispatch({ type: "failed" });
    },
  );
};

// 화면은 "마이크를 준비하고 있어요"인 동안 판정한다. 녹음기는 이미 돌고 있어 일찍 읽은 말도 남는다.
// 판정 값은 콘솔에 남긴다. 실기기에서 바닥값을 맞출 때 원격 디버깅으로 본다.
const watchMic = (dispatch: Dispatch, session: SessionRef, options: TakeOptions, startedAt: number): void => {
  const timer = window.setInterval(() => {
    const elapsedMs = Date.now() - startedAt;
    const peak = session.current.probe?.read()?.peak ?? null;
    const verdict = micCheckVerdict(peak, elapsedMs);
    if (verdict === "wait") return;
    window.clearInterval(timer);
    const check: MicCheckResult = { verdict, peak, afterMs: elapsedMs };
    session.current = { ...session.current, checkTimer: null, check };
    console.info(micCheckLine(check));
    if (verdict === "dead") return switchToBrowserProcessing(dispatch, session, options);
    dispatch({ type: "started", at: startedAt });
  }, MIC_CHECK_INTERVAL_MS);
  session.current = { ...session.current, checkTimer: timer };
};

// 녹음기를 바로 돌리고, 시작 시각을 녹음기가 실제로 시작한 때로 둔다(타이머와 자동 정지가 녹음 길이와 맞는다).
export const startTake = (dispatch: Dispatch, session: SessionRef, options: TakeOptions, stream: MediaStream, processing: MicProcessing): void => {
  const detachSource = session.current.probe?.attach(stream) ?? null;
  const recorder = beginRecording(stream, options.mimeType, (blob) => options.onCaptured(blob, processing));
  const startedAt = Date.now();
  session.current = { ...session.current, stream, recorder, detachSource };
  if (!needsMicCheck(processing, session.current.probe?.canMeasure ?? false)) return dispatch({ type: "started", at: startedAt });
  watchMic(dispatch, session, options, startedAt);
};
