import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { localStore } from "../browser/storage";
import { meterStep } from "./input-level";
import { useMicrophoneSession } from "./microphone-session";
import { readProcessing, rememberProcessing } from "./processing-memory";
import { INITIAL_RECORDER_STATE, transition, type RecorderState } from "./recorder-state";
import { pickRecordingMimeType, type MicProcessing } from "./recording-format";

export type Recorder = {
  readonly state: RecorderState;
  readonly elapsedMs: number;
  // 화면 음량 막대 칸 수(0~METER_STEP_COUNT). 녹음 중에만 움직인다.
  readonly level: number;
  readonly mimeType: string;
  readonly processing: MicProcessing;
  readonly start: () => void;
  readonly stop: () => void;
  readonly reset: () => void;
};

const TICK_MS = 200;

const supportedMimeType = (): string =>
  pickRecordingMimeType((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";

type Tick = { readonly now: number; readonly level: number };

type TickSource = { readonly readLevel: () => number; readonly maxMs: number; readonly stop: () => void };

// 타이머와 음량 막대를 같은 박자로 읽는다. 읽을 때마다 최대 입력도 쌓인다.
// 최대 길이에 닿으면 같은 박자에서 멈춘다(지난 시간을 effect로 다시 지켜보지 않는다).
const useRecordingTick = (state: RecorderState, { readLevel, maxMs, stop }: TickSource): Tick => {
  const [tick, setTick] = useState<Tick>(() => ({ now: Date.now(), level: 0 }));
  const startedAt = state.kind === "recording" ? state.startedAt : null;
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTick({ now, level: meterStep(readLevel()) });
      if (now - startedAt >= maxMs) stop();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [startedAt, readLevel, maxMs, stop]);
  return startedAt === null ? { now: 0, level: 0 } : { now: Math.max(0, tick.now - startedAt), level: tick.level };
};

export const useRecorder = (maxMs: number): Recorder => {
  const [state, dispatch] = useReducer(transition, INITIAL_RECORDER_STATE);
  // 브라우저가 지원하는 형식은 바뀌지 않으니 한 번만 고른다.
  const mimeType = useMemo(() => supportedMimeType(), []);
  const [processing, setProcessing] = useState<MicProcessing>(() => readProcessing(localStore()));
  const onSilentTake = useCallback(() => {
    setProcessing("browser");
    rememberProcessing(localStore(), "browser");
  }, []);
  const { start, stop, readLevel } = useMicrophoneSession(dispatch, { mimeType, processing, onSilentTake });
  const { now: elapsedMs, level } = useRecordingTick(state, { readLevel, maxMs, stop });
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  return { state, elapsedMs, level, mimeType, processing, start, stop, reset };
};
