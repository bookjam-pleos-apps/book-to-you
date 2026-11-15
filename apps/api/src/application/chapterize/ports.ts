import type { FinishedChapter } from "../renders";

// 장 계획이 생기기 전에 장 하나로 올린 렌더다.
export type SingleChapterRender = {
  readonly renderId: string;
  readonly userId: string;
  readonly voiceId: string;
  readonly storyId: string;
  readonly storyVersion: string;
  readonly chapterId: string;
  readonly storageKey: string;
};

// render_changed: 그 사이 장이 바뀌었다(삭제, 다른 나누기). no_active_consent: 동의가 철회됐다.
export type ChapterReplacement = "replaced" | "render_changed" | "no_active_consent";

export interface ChapterizeRepo {
  listSingleChapterRenders(): Promise<readonly SingleChapterRender[]>;
  replaceChapter(render: SingleChapterRender, chapters: readonly FinishedChapter[]): Promise<ChapterReplacement>;
}
