import { clipResponseSchema, consentPhraseResponseSchema, voiceSchema } from "@voice-storybook/shared/contracts/v1";
import type { Style } from "@voice-storybook/shared/vocab";

import { createConsentRepo } from "../adapters/db/repos/consent-repo";
import { toneRecording } from "./audio-fixtures";
import { postJson, TEST_ORIGIN, TEST_TERMS, type TestRuntime } from "./test-runtime";

const form = (fields: Record<string, string>, audio: Uint8Array | null): FormData => {
  const body = new FormData();
  Object.entries(fields).forEach(([name, value]) => body.append(name, value));
  if (audio !== null) body.append("audio", new File([Buffer.from(audio)], "recording"));
  return body;
};

export const postForm = (
  runtime: TestRuntime,
  path: string,
  cookie: string,
  fields: Record<string, string>,
  audio: Uint8Array | null,
) => runtime.app.request(path, { method: "POST", headers: { cookie, origin: TEST_ORIGIN }, body: form(fields, audio) });

export const createVoiceFor = async (runtime: TestRuntime, cookie: string, label = "엄마"): Promise<string> => {
  const response = await postJson(runtime, "/v1/voices", { label }, { cookie });
  return voiceSchema.parse(await response.json()).id;
};

export const issuePhrase = async (runtime: TestRuntime, voiceId: string, cookie: string) => {
  const response = await postJson(runtime, `/v1/voices/${voiceId}/consent/phrase`, {}, { cookie });
  return consentPhraseResponseSchema.parse(await response.json());
};

export const consentFields = (phraseToken: string) => ({
  phraseToken,
  speakerLabel: "엄마",
  confirmedOwnVoice: "true",
  ...TEST_TERMS,
});

export const submitConsentFor = async (runtime: TestRuntime, voiceId: string, cookie: string, audio: Uint8Array) => {
  const { phraseToken } = await issuePhrase(runtime, voiceId, cookie);
  return postForm(runtime, `/v1/voices/${voiceId}/consent`, cookie, consentFields(phraseToken), audio);
};

export const createActiveVoice = async (runtime: TestRuntime, cookie: string, consentAudio: Uint8Array): Promise<string> => {
  const voiceId = await createVoiceFor(runtime, cookie);
  const response = await submitConsentFor(runtime, voiceId, cookie, consentAudio);
  const { id } = clipResponseSchema.parse(await response.json());
  await createConsentRepo(runtime.database).activate(id, 1);
  return voiceId;
};

export const clipFields = (style: Style = "calm") => ({ style, scriptId: style, scriptVersion: "1" });

export const CLIP_SECONDS = 15;

export const validClip = (): Uint8Array => toneRecording({ seconds: CLIP_SECONDS });
