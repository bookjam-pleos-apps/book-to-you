import { z } from "zod";

import { CHAPTER_ROLES } from "../../vocab";
import { audioUrlField, chapterTitleField } from "./library";

// 운영진이 등록한 동화다. 부모가 골라서 자기 목소리로 만든다.
export const storySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

export const storyListResponseSchema = z.object({
  stories: z.array(storySchema),
});

export const RENDER_STATUSES = ["making", "playable", "failed"] as const;

// (목소리, 동화) 쌍마다 하나다. playable이면 차에서 들을 수 있다.
export const renderSchema = z.object({
  renderId: z.string().min(1),
  storyId: z.string().min(1),
  title: z.string().min(1),
  voiceId: z.string().min(1),
  voiceLabel: z.string().min(1),
  status: z.enum(RENDER_STATUSES),
  // 시연 서버에서 다른 계정(데모 계정)이 게시해 함께 보이는 동화다. 듣기만 한다.
  shared: z.boolean(),
});

export const renderListResponseSchema = z.object({
  renders: z.array(renderSchema),
});

// 부모 웹에서 듣는 장. 차와 같은 오디오 경로를 쓴다.
export const renderChapterSchema = z.object({
  index: z.number().int().nonnegative(),
  role: z.enum(CHAPTER_ROLES),
  title: chapterTitleField,
  durationMs: z.number().int().nonnegative(),
  audioUrl: audioUrlField,
});

// playable이 아니면 chapters는 비어 있다.
export const renderDetailSchema = renderSchema.extend({
  chapters: z.array(renderChapterSchema),
});

export const createRenderRequestSchema = z.object({
  storyId: z.string().min(1),
  voiceId: z.string().min(1),
});

export type Story = z.infer<typeof storySchema>;
export type Render = z.infer<typeof renderSchema>;
export type RenderDetail = z.infer<typeof renderDetailSchema>;
export type RenderStatus = (typeof RENDER_STATUSES)[number];
