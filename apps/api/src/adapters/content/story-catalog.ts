import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { STYLES } from "@voice-storybook/shared/vocab";
import { z } from "zod";

import type { StoryCatalog, StoryContent, StoryContents } from "../../application/stories/ports";
import { firstInvalidChapter, PARAGRAPH_PAUSE_MS, type ChapterPlan } from "../../domain/renders/chapter-plan";
import { storyVersion, type StoryLine } from "../../domain/stories/story-version";
import { sha256Hex } from "../../domain/sha256";

const storySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sentences: z.array(z.object({ text: z.string().min(1), style: z.enum(STYLES), pauseAfterMs: z.number().int().nonnegative() })),
  chapters: z.array(z.object({ from: z.number().int().nonnegative(), title: z.string().min(1) })).default([]),
});

const NOT_A_STORY = [".draft.json", ".annotations.json"];

const isConfirmedStory = (name: string): boolean => name.endsWith(".json") && !NOT_A_STORY.some((suffix) => name.endsWith(suffix));

// 잘못된 장 계획은 서버를 띄울 때 바로 드러낸다. 몇 번째 장인지 알려 원고를 고치기 쉽게 한다.
const assertChapterPlan = (path: string, lines: readonly StoryLine[], plan: readonly ChapterPlan[]): void => {
  const invalid = firstInvalidChapter(lines, plan);
  if (invalid === null) return;
  const from = plan[invalid]?.from;
  throw new Error(`${path}: chapters[${invalid}] (from ${from}) must start at 0 or right after a ${PARAGRAPH_PAUSE_MS}ms pause, after the previous chapter`);
};

const readStory = (path: string): StoryContent => {
  const { id, title, sentences, chapters } = storySchema.parse(JSON.parse(readFileSync(path, "utf8")));
  assertChapterPlan(path, sentences, chapters);
  return { id, title: title ?? null, version: storyVersion(sentences, sha256Hex), lines: sentences, chapters };
};

export const readConfirmedStories = (directory: string): readonly StoryContent[] => {
  const names = existsSync(directory) ? readdirSync(directory).filter(isConfirmedStory) : [];
  return names.map((name) => readStory(join(directory, name)));
};

export const loadStoryCatalog = (directory: string): StoryCatalog & StoryContents => {
  const stories = new Map(readConfirmedStories(directory).map((story) => [story.id, story] as const));
  return {
    findTitle: (storyId) => stories.get(storyId)?.title ?? null,
    list: () => [...stories.values()].map(({ id, title }) => ({ id, title })),
    findStory: (storyId) => stories.get(storyId) ?? null,
  };
};
