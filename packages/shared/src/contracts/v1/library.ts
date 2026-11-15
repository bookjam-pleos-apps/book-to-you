import { z } from "zod";

import { CHAPTER_ROLES, PROMPT_KINDS } from "../../vocab";

// 차와 부모 웹이 같은 오디오 경로를 쓴다. 세션 쿠키나 기기 토큰으로 받는다.
export const audioUrlField = z.string().regex(/^\/v1\/audio\/[^/]+$/);

const audioAsset = z.object({
  durationMs: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  audioUrl: audioUrlField,
});

// 장 제목이 없는 이야기는 장 하나로 듣는다. 클라이언트는 null이면 "제n장"으로 대신한다.
export const chapterTitleField = z.string().min(1).nullable();

export const manifestChapterSchema = audioAsset.extend({
  index: z.number().int().nonnegative(),
  role: z.enum(CHAPTER_ROLES),
  title: chapterTitleField,
});

export const manifestStorySchema = z.object({
  renderId: z.string().min(1),
  storyId: z.string().min(1),
  title: z.string().min(1),
  voiceId: z.string().min(1),
  voiceLabel: z.string().min(1),
  chapters: z.array(manifestChapterSchema),
});

export const manifestPromptSchema = audioAsset.extend({
  id: z.string().min(1),
  kind: z.enum(PROMPT_KINDS),
  voiceId: z.string().min(1),
});

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  maxOfflineSeconds: z.number().int().positive(),
  // 부모가 고른 대표 목소리다. 없거나 동의가 철회됐으면 null이고, 그 목소리의 이야기가 아직 없을 수도 있다.
  defaultVoiceId: z.string().min(1).nullable(),
  stories: z.array(manifestStorySchema),
  prompts: z.array(manifestPromptSchema),
});

export type Manifest = z.infer<typeof manifestSchema>;
