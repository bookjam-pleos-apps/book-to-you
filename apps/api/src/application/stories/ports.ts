import type { ChapterPlan } from "../../domain/renders/chapter-plan";
import type { StoryLine } from "../../domain/stories/story-version";

export type StoryEntry = {
  readonly id: string;
  readonly title: string | null;
};

export interface StoryCatalog {
  findTitle(storyId: string): string | null;
  list(): readonly StoryEntry[];
}

export type StoryContent = {
  readonly id: string;
  readonly title: string | null;
  readonly version: string;
  readonly lines: readonly StoryLine[];
  readonly chapters: readonly ChapterPlan[];
};

export interface StoryContents {
  findStory(storyId: string): StoryContent | null;
}
