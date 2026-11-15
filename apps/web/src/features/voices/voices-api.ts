import {
  clipResponseSchema,
  consentPhraseResponseSchema,
  consentResponseSchema,
  createVoiceRequestSchema,
  promptResponseSchema,
  recordingScriptsResponseSchema,
  updateVoiceRequestSchema,
  voiceListResponseSchema,
  voiceSchema,
} from "@voice-storybook/shared/contracts/v1";
import type { PromptKind, Style } from "@voice-storybook/shared/vocab";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { z } from "zod";

import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { requestForm, requestJson, requestNoContent } from "../../shared/api-client/request";
import type { Terms } from "../../shared/api-client/terms";

export type ScriptRef = { readonly id: string; readonly version: string };
export type RecordingScripts = z.infer<typeof recordingScriptsResponseSchema>;

const voicePath = (voiceId: string): string => `/v1/voices/${encodeURIComponent(voiceId)}`;

const audioForm = (audio: File, fields: Readonly<Record<string, string>>): FormData => {
  const form = new FormData();
  Object.entries(fields).forEach(([name, value]) => form.append(name, value));
  form.append("audio", audio);
  return form;
};

export const createVoice = (label: string) =>
  requestJson("POST", "/v1/voices", voiceSchema, createVoiceRequestSchema.parse({ label }));

export type VoiceChange = { readonly label?: string; readonly isDefault?: boolean };

export const updateVoice = (voiceId: string, change: VoiceChange) =>
  requestJson("PATCH", voicePath(voiceId), voiceSchema, updateVoiceRequestSchema.parse(change));

export const deleteVoice = (voiceId: string): Promise<void> => requestNoContent("DELETE", voicePath(voiceId));

export const uploadClip = (voiceId: string, style: Style, script: ScriptRef, audio: File) =>
  requestForm(`${voicePath(voiceId)}/clips`, audioForm(audio, { style, scriptId: script.id, scriptVersion: script.version }), clipResponseSchema);

export const uploadPrompt = (voiceId: string, kind: PromptKind, script: ScriptRef, audio: File) =>
  requestForm(`${voicePath(voiceId)}/prompts/${kind}`, audioForm(audio, { scriptId: script.id, scriptVersion: script.version }), promptResponseSchema);

export type ConsentInput = { readonly phraseToken: string; readonly speakerLabel: string; readonly terms: Terms };

export const submitConsent = (voiceId: string, input: ConsentInput, audio: File) =>
  requestForm(
    `${voicePath(voiceId)}/consent`,
    audioForm(audio, { phraseToken: input.phraseToken, speakerLabel: input.speakerLabel, confirmedOwnVoice: "true", ...input.terms }),
    consentResponseSchema,
  );

const issueConsentPhrase = (voiceId: string) =>
  requestJson("POST", `${voicePath(voiceId)}/consent/phrase`, consentPhraseResponseSchema);

const fetchVoice = (voiceId: string) => requestJson("GET", voicePath(voiceId), voiceSchema);

export const useVoices = () =>
  useQuery({ queryKey: QUERY_KEYS.voices, queryFn: () => requestJson("GET", "/v1/voices", voiceListResponseSchema) });

export const useVoice = (voiceId: string) =>
  useQuery({ queryKey: QUERY_KEYS.voice(voiceId), queryFn: () => fetchVoice(voiceId) });

export const useRecordingScripts = () =>
  useQuery({
    queryKey: QUERY_KEYS.recordingScripts,
    queryFn: () => requestJson("GET", "/v1/recording-scripts", recordingScriptsResponseSchema),
    staleTime: Infinity,
  });

// 문구 발급은 POST지만 화면을 열 때 한 번 받아 두는 값이다. 포커스마다 새로 받지 않는다.
export const useConsentPhrase = (voiceId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.consentPhrase(voiceId),
    queryFn: () => issueConsentPhrase(voiceId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

// 업로드 직후 판정을 읽는다. 캐시를 건너뛰고 서버에서 새로 받는다.
export const refreshVoice = (queryClient: QueryClient, voiceId: string) =>
  queryClient.fetchQuery({ queryKey: QUERY_KEYS.voice(voiceId), queryFn: () => fetchVoice(voiceId), staleTime: 0 });
