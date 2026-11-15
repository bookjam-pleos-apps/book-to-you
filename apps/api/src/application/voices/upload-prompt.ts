import { randomUUID } from "node:crypto";

import type { PromptKind } from "@voice-storybook/shared/vocab";

import { WAV_CONTENT_TYPE } from "../../domain/audio-content-type";
import type { DurationLimits, SignalRejection } from "../../domain/voices/signal-qc";
import { promptKey } from "../../domain/storage-keys";
import { requestPurge, type JobQueue } from "../ports/job-queue";
import type { ObjectStorage } from "../ports/object-storage";
import { checkRecording, type CheckRecordingDeps, type PassedRecording } from "./check-recording";
import { findPromptScript, type RecordingScripts } from "../recording-scripts";
import type { NewPrompt, PromptRepo } from "./ports";
import { recordingGateFailure, type RecordingGateDeps, type RecordingGateFailure } from "./recording-gate";

export type UploadPromptDeps = CheckRecordingDeps & RecordingGateDeps & {
  readonly prompts: PromptRepo;
  readonly storage: ObjectStorage;
  readonly queue: JobQueue;
  readonly scripts: RecordingScripts;
  readonly duration: DurationLimits;
};

export type UploadPromptInput = {
  readonly voiceId: string;
  readonly userId: string;
  readonly kind: PromptKind;
  readonly scriptId: string;
  readonly scriptVersion: string;
  readonly upload: Uint8Array;
};

export type UploadPromptResult =
  | { readonly kind: "stored"; readonly promptId: string }
  | { readonly kind: RecordingGateFailure | "unreadable" }
  | { readonly kind: "rejected"; readonly reasons: readonly SignalRejection[] };

const knowsScript = (scripts: RecordingScripts, input: UploadPromptInput): boolean =>
  findPromptScript(scripts, input.scriptId, input.scriptVersion)?.kind === input.kind;

const toNewPrompt = (input: UploadPromptInput, id: string, storageKey: string, recording: PassedRecording): NewPrompt => ({
  id,
  userId: input.userId,
  voiceId: input.voiceId,
  kind: input.kind,
  scriptId: input.scriptId,
  scriptVersion: input.scriptVersion,
  storageKey,
  sha256: recording.sha256,
  durationMs: recording.durationMs,
  bytes: recording.wav.length,
  signal: recording.signal,
});

const storePrompt = async (deps: UploadPromptDeps, input: UploadPromptInput, recording: PassedRecording): Promise<UploadPromptResult> => {
  const id = randomUUID();
  const storageKey = promptKey(input.userId, input.voiceId, id);
  await deps.storage.put(storageKey, recording.wav, WAV_CONTENT_TYPE);
  const outcome = await deps.prompts.replaceIfConsentActive(toNewPrompt(input, id, storageKey, recording));
  if (outcome === "consent_inactive") {
    await deps.storage.deleteKeys([storageKey]);
    return { kind: "no_active_consent" };
  }
  if (outcome === "replaced") await requestPurge(deps.queue);
  return { kind: "stored", promptId: id };
};

// 부모가 직접 녹음한 소리를 그대로 재생하므로 대본 일치 확인 없이 신호 QC만 통과하면 쓸 수 있다.
export const uploadPrompt =
  (deps: UploadPromptDeps) =>
  async (input: UploadPromptInput): Promise<UploadPromptResult> => {
    const failure = await recordingGateFailure(deps, input, knowsScript(deps.scripts, input));
    if (failure !== null) return { kind: failure };
    const recording = await checkRecording(deps, input.upload, deps.duration);
    return recording.kind === "passed" ? storePrompt(deps, input, recording) : recording;
  };
