import {
  judgeSignal,
  measureSignal,
  type DurationLimits,
  type SignalLimits,
  type SignalMeasurement,
  type SignalRejection,
} from "../../domain/voices/signal-qc";
import { sha256Hex } from "../../domain/sha256";
import type { AudioTool } from "../ports/audio-tool";

export type CheckRecordingDeps = {
  readonly audio: AudioTool;
  readonly signalLimits: SignalLimits;
};

export type PassedRecording = {
  readonly kind: "passed";
  readonly wav: Uint8Array;
  readonly sha256: string;
  readonly durationMs: number;
  readonly signal: SignalMeasurement;
};

export type CheckedRecording =
  | { readonly kind: "unreadable" }
  | { readonly kind: "rejected"; readonly reasons: readonly SignalRejection[] }
  | PassedRecording;

export const checkRecording = async (
  { audio, signalLimits }: CheckRecordingDeps,
  upload: Uint8Array,
  duration: DurationLimits,
): Promise<CheckedRecording> => {
  const prepared = await audio.prepare(upload);
  if (prepared === null) return { kind: "unreadable" };
  const signal = measureSignal(prepared.samples, prepared.sampleRate);
  const reasons = judgeSignal(signal, prepared.durationMs, duration, signalLimits);
  if (reasons.length > 0) return { kind: "rejected", reasons };
  return { kind: "passed", wav: prepared.wav, sha256: sha256Hex(prepared.wav), durationMs: prepared.durationMs, signal };
};
