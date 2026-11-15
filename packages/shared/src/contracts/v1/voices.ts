import { z } from "zod";

import { CLIP_ADVICES, CLIP_FAILURES, PROMPT_KINDS, STYLES } from "../../vocab";

const clipStatus = z.enum(["checking", "passed", "failed"]);

const voiceLabel = z.string().trim().min(1).max(32);

export const createVoiceRequestSchema = z.object({
  label: voiceLabel,
});

export const updateVoiceRequestSchema = z
  .object({ label: voiceLabel.optional(), isDefault: z.boolean().optional() })
  .refine((body) => body.label !== undefined || body.isDefault !== undefined, { message: "nothing to change" });

export const voiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  consent: z.enum(["none", "checking", "active"]),
  // 낭독 확인에서 탈락해 다시 제출해야 한다. consent가 none일 때만 참이다.
  consentRejected: z.boolean(),
  // 차량이 처음 고를 목소리다. 계정마다 많아야 하나다.
  isDefault: z.boolean(),
  // failure는 탈락한 이유다. 이유를 남기지 않은 탈락(객체나 대본이 사라짐)과 탈락이 아닌 녹음은 null이다.
  // advice는 통과한 녹음에 붙는 코칭이다. 더 잘 읽을 여지가 없으면 null이다. 이 필드가 생기기 전의 응답도 읽도록 없으면 null로 본다.
  clips: z.array(
    z.object({
      id: z.string().min(1),
      style: z.enum(STYLES),
      status: clipStatus,
      failure: z.enum(CLIP_FAILURES).nullable(),
      advice: z.enum(CLIP_ADVICES).nullable().default(null),
    }),
  ),
  progress: z.array(z.object({ style: z.enum(STYLES), status: z.enum(["missing", ...clipStatus.options]) })),
});

export const voiceListResponseSchema = z.object({
  voices: z.array(voiceSchema),
});

export const consentPhraseResponseSchema = z.object({
  phrase: z.string().min(1),
  phraseToken: z.string().min(1),
  expiresInSec: z.number().int().positive(),
});

// multipart 필드다. 파일은 `audio`로 받는다.
export const consentFormSchema = z.object({
  phraseToken: z.string().min(1),
  speakerLabel: voiceLabel,
  confirmedOwnVoice: z.literal("true"),
  termsVersion: z.string().min(1),
  aiNoticeVersion: z.string().min(1),
});

export const consentResponseSchema = z.object({
  id: z.string().min(1),
  status: z.literal("checking"),
});

export const clipFormSchema = z.object({
  style: z.enum(STYLES),
  scriptId: z.string().min(1),
  scriptVersion: z.string().min(1),
});

export const clipResponseSchema = z.object({
  id: z.string().min(1),
  status: z.literal("checking"),
});

export const promptFormSchema = z.object({
  scriptId: z.string().min(1),
  scriptVersion: z.string().min(1),
});

export const promptResponseSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(PROMPT_KINDS),
});

export const signalRejectedResponseSchema = z.object({
  error: z.literal("signal_rejected"),
  reasons: z.array(z.enum(["too_short", "too_long", "clipped", "too_noisy", "too_quiet"])),
});

const scriptFields = {
  id: z.string().min(1),
  version: z.string().min(1),
  direction: z.string().min(1),
  text: z.string().min(1),
};

export const recordingScriptsResponseSchema = z.object({
  clips: z.array(z.object({ ...scriptFields, style: z.enum(STYLES) })),
  prompts: z.array(z.object({ ...scriptFields, kind: z.enum(PROMPT_KINDS) })),
});

export type VoiceResponse = z.infer<typeof voiceSchema>;
