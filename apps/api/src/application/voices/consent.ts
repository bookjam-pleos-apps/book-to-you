import { randomInt, randomUUID } from "node:crypto";

import { WAV_CONTENT_TYPE } from "../../domain/audio-content-type";
import { createConsentPhrase } from "../../domain/voices/consent-phrase";
import { readPhraseToken, signPhraseToken } from "../../domain/voices/phrase-token";
import type { DurationLimits, SignalRejection } from "../../domain/voices/signal-qc";
import { consentAudioKey } from "../../domain/storage-keys";
import { isCurrentTerms } from "../../domain/terms";
import type { Clock } from "../ports/clock";
import { requestVerifyConsent, type JobQueue } from "../ports/job-queue";
import type { ObjectStorage } from "../ports/object-storage";
import { checkRecording, type CheckRecordingDeps, type PassedRecording } from "./check-recording";
import type { ConsentRepo, NewConsent, VoiceRepo } from "./ports";

export type ConsentDeps = CheckRecordingDeps & {
  readonly voices: VoiceRepo;
  readonly consents: ConsentRepo;
  readonly storage: ObjectStorage;
  readonly queue: JobQueue;
  readonly clock: Clock;
  readonly secret: string;
  readonly phraseTtlMs: number;
  readonly duration: DurationLimits;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
};

export type IssuedPhrase = { readonly phrase: string; readonly phraseToken: string; readonly expiresInSec: number };

export const issueConsentPhrase =
  ({ voices, clock, secret, phraseTtlMs }: ConsentDeps) =>
  async (voiceId: string, userId: string): Promise<IssuedPhrase | null> => {
    if ((await voices.find(voiceId, userId)) === null) return null;
    const phrase = createConsentPhrase(randomInt);
    const expiresAtMs = clock().getTime() + phraseTtlMs;
    const phraseToken = signPhraseToken(secret, { voiceId, phrase, expiresAtMs });
    return { phrase, phraseToken, expiresInSec: phraseTtlMs / 1000 };
  };

export type SubmitConsentInput = {
  readonly voiceId: string;
  readonly userId: string;
  readonly phraseToken: string;
  readonly speakerLabel: string;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
  readonly upload: Uint8Array;
};

type PrecheckFailure = "not_found" | "invalid_phrase" | "terms_outdated" | "already_live";

export type SubmitConsentResult =
  | { readonly kind: "checking"; readonly consentId: string }
  | { readonly kind: PrecheckFailure | "unreadable" }
  | { readonly kind: "rejected"; readonly reasons: readonly SignalRejection[] };

const precheck = async (
  deps: ConsentDeps,
  input: SubmitConsentInput,
): Promise<{ readonly failure: PrecheckFailure } | { readonly phrase: string }> => {
  if (!isCurrentTerms(deps, input)) return { failure: "terms_outdated" };
  const voice = await deps.voices.find(input.voiceId, input.userId);
  if (voice === null) return { failure: "not_found" };
  if (voice.consent !== null) return { failure: "already_live" };
  const claims = readPhraseToken(deps.secret, input.phraseToken, deps.clock().getTime());
  if (claims === null || claims.voiceId !== input.voiceId) return { failure: "invalid_phrase" };
  return { phrase: claims.phrase };
};

const toNewConsent = (input: SubmitConsentInput, id: string, phrase: string, sha256: string, givenAt: Date): NewConsent => ({
  id,
  userId: input.userId,
  voiceId: input.voiceId,
  speakerLabel: input.speakerLabel,
  termsVersion: input.termsVersion,
  aiNoticeVersion: input.aiNoticeVersion,
  phrase,
  phraseAudioSha256: sha256,
  givenAt,
});

const storeAndRecord = async (
  deps: ConsentDeps,
  input: SubmitConsentInput,
  phrase: string,
  recording: PassedRecording,
): Promise<SubmitConsentResult> => {
  const id = randomUUID();
  const key = consentAudioKey(input.userId, input.voiceId, id);
  await deps.storage.put(key, recording.wav, WAV_CONTENT_TYPE);
  const inserted = await deps.consents.insertChecking(toNewConsent(input, id, phrase, recording.sha256, deps.clock()));
  if (inserted === "inserted") {
    await requestVerifyConsent(deps.queue, id);
    return { kind: "checking", consentId: id };
  }
  await deps.storage.deleteKeys([key]);
  return { kind: inserted === "already_live" ? "already_live" : "not_found" };
};

export const submitConsent =
  (deps: ConsentDeps) =>
  async (input: SubmitConsentInput): Promise<SubmitConsentResult> => {
    const checked = await precheck(deps, input);
    if ("failure" in checked) return { kind: checked.failure };
    const recording = await checkRecording(deps, input.upload, deps.duration);
    if (recording.kind !== "passed") return recording;
    return storeAndRecord(deps, input, checked.phrase, recording);
  };
