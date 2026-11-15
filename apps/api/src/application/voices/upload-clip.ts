import { randomUUID } from "node:crypto";

import type { Style } from "@voice-storybook/shared/vocab";

import { WAV_CONTENT_TYPE } from "../../domain/audio-content-type";
import type { DurationLimits, SignalRejection } from "../../domain/voices/signal-qc";
import { clipKey } from "../../domain/storage-keys";
import { requestVerifyClip, type JobQueue } from "../ports/job-queue";
import type { ObjectStorage } from "../ports/object-storage";
import { checkRecording, type CheckRecordingDeps, type PassedRecording } from "./check-recording";
import { findClipScript, type RecordingScripts } from "../recording-scripts";
import type { ClipRepo, NewClip } from "./ports";
import { recordingGateFailure, type RecordingGateDeps, type RecordingGateFailure } from "./recording-gate";

export type UploadClipDeps = CheckRecordingDeps & RecordingGateDeps & {
  readonly clips: ClipRepo;
  readonly storage: ObjectStorage;
  readonly queue: JobQueue;
  readonly scripts: RecordingScripts;
  readonly duration: DurationLimits;
};

export type UploadClipInput = {
  readonly voiceId: string;
  readonly userId: string;
  readonly style: Style;
  readonly scriptId: string;
  readonly scriptVersion: string;
  readonly upload: Uint8Array;
};

export type UploadClipResult =
  | { readonly kind: "checking"; readonly clipId: string }
  | { readonly kind: RecordingGateFailure | "unreadable" }
  | { readonly kind: "rejected"; readonly reasons: readonly SignalRejection[] };

const knowsScript = (scripts: RecordingScripts, input: UploadClipInput): boolean =>
  findClipScript(scripts, input.scriptId, input.scriptVersion)?.style === input.style;

const toNewClip = (input: UploadClipInput, id: string, storageKey: string, recording: PassedRecording): NewClip => ({
  id,
  userId: input.userId,
  voiceId: input.voiceId,
  style: input.style,
  scriptId: input.scriptId,
  scriptVersion: input.scriptVersion,
  storageKey,
  sha256: recording.sha256,
  durationMs: recording.durationMs,
  signal: recording.signal,
});

const storeClip = async (
  deps: UploadClipDeps,
  input: UploadClipInput,
  recording: PassedRecording,
): Promise<UploadClipResult> => {
  const id = randomUUID();
  const storageKey = clipKey(input.userId, input.voiceId, id);
  await deps.storage.put(storageKey, recording.wav, WAV_CONTENT_TYPE);
  if (await deps.clips.insertIfConsentActive(toNewClip(input, id, storageKey, recording))) {
    await requestVerifyClip(deps.queue, id);
    return { kind: "checking", clipId: id };
  }
  // 처리하는 동안 동의가 철회되거나 음성이 삭제됐다. 객체를 남기면 삭제 보장이 깨진다.
  await deps.storage.deleteKeys([storageKey]);
  return { kind: "no_active_consent" };
};

export const uploadClip =
  (deps: UploadClipDeps) =>
  async (input: UploadClipInput): Promise<UploadClipResult> => {
    const failure = await recordingGateFailure(deps, input, knowsScript(deps.scripts, input));
    if (failure !== null) return { kind: failure };
    const recording = await checkRecording(deps, input.upload, deps.duration);
    return recording.kind === "passed" ? storeClip(deps, input, recording) : recording;
  };
