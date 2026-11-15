import { useCallback, useEffect, useRef } from "react";

import { isSilentTake } from "./input-level";
import { openLevelProbe } from "./level-probe";
import { takeLine } from "./mic-check";
import { closeSession, EMPTY_SESSION, startTake, type Dispatch, type Session, type SessionRef, type TakeOptions } from "./mic-take";
import { microphoneConstraints, type MicProcessing } from "./recording-format";

const isPermissionDenied = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");

// 처음에는 기억한 처리(대개 끔)로 연다. 끈 마이크가 죽어 있으면 startTake가 준비 중에 갈아탄다.
const openAndRecord = (dispatch: Dispatch, session: SessionRef, processing: MicProcessing, options: TakeOptions) => {
  dispatch({ type: "acquire" });
  const probe = openLevelProbe();
  navigator.mediaDevices.getUserMedia(microphoneConstraints(processing)).then(
    (stream) => {
      // 권한 응답이 오기 전에 화면을 떠났다. 녹음을 시작하지 않고 마이크를 바로 닫는다.
      if (!options.isMounted()) return closeSession({ current: { ...EMPTY_SESSION, stream, probe } });
      dispatch({ type: "granted" });
      session.current = { ...EMPTY_SESSION, probe };
      startTake(dispatch, session, options, stream, processing);
    },
    (error: unknown) => {
      probe.close();
      dispatch({ type: isPermissionDenied(error) ? "denied" : "failed" });
    },
  );
};

// StrictMode는 effect를 두 번 붙였다 뗀다. 붙을 때마다 다시 true로 둔다.
const useIsMounted = (): (() => boolean) => {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
};

type SessionOptions = {
  readonly mimeType: string;
  readonly processing: MicProcessing;
  // 처리를 끈 마이크가 죽어 갈아탔거나, 소리가 담기지 않은 녹음이 끝났을 때 부른다. 다음 녹음부터 처리를 켠다.
  readonly onSilentTake: () => void;
};

export const useMicrophoneSession = (dispatch: Dispatch, { mimeType, processing, onSilentTake }: SessionOptions) => {
  const session = useRef<Session>(EMPTY_SESSION);
  const isMounted = useIsMounted();
  const onCaptured = useCallback((blob: Blob, used: MicProcessing) => {
    const peak = session.current.probe?.read()?.peak ?? null;
    const { check } = session.current;
    console.info(takeLine(peak, check));
    dispatch({ type: "captured", blob, at: Date.now(), peak, processing: used, micCheck: check });
    closeSession(session);
    dispatch({ type: "released" });
    if (isSilentTake(peak)) onSilentTake();
  }, [dispatch, onSilentTake]);
  const start = useCallback(
    () => openAndRecord(dispatch, session, processing, { mimeType, onCaptured, onSwitched: onSilentTake, isMounted }),
    [dispatch, mimeType, processing, onCaptured, onSilentTake, isMounted],
  );
  // 자동 정지가 onstop 전에 다시 부를 수 있다. 멈춘 MediaRecorder의 stop()은 InvalidStateError를 던진다.
  // 마이크 점검 중(준비 중)에는 멈추지 않는다. 화면에는 아직 녹음이 시작되지 않았다.
  const stop = useCallback(() => {
    const { recorder, checkTimer } = session.current;
    if (checkTimer === null && recorder?.state === "recording") recorder.stop();
  }, []);
  const readLevel = useCallback(() => session.current.probe?.read()?.current ?? 0, []);
  useEffect(() => () => closeSession(session), []);
  return { start, stop, readLevel };
};
