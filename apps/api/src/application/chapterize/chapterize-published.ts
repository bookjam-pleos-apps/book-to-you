import { CHAPTER_CONTENT_TYPE } from "../../domain/audio-content-type";
import { mapInSequence } from "../../domain/in-sequence";
import { planChapterSpans, type ChapterPlanProblem, type ChapterSpan } from "../../domain/renders/chapter-plan";
import { sha256Hex } from "../../domain/sha256";
import { chapterKey } from "../../domain/storage-keys";
import type { AudioCutter } from "../ports/audio-cutter";
import { readObjectBytes, type ObjectStorage } from "../ports/object-storage";
import type { SilenceFinder } from "../ports/silence-finder";
import type { StoryContents } from "../stories";
import type { FinishedChapter } from "../renders";
import type { ChapterizeRepo, ChapterReplacement, SingleChapterRender } from "./ports";

export type ChapterizeDeps = {
  readonly renders: ChapterizeRepo;
  readonly stories: StoryContents;
  readonly storage: ObjectStorage;
  readonly silences: SilenceFinder;
  readonly cutter: AudioCutter;
};

export type ChapterizeOutcome = {
  readonly renderId: string;
  readonly storyId: string;
  readonly result: "split" | "no_plan" | "story_missing" | "story_changed" | Exclude<ChapterReplacement, "replaced"> | ChapterPlanProblem;
  readonly chapters: number;
};

const spansOf = async (deps: ChapterizeDeps, render: SingleChapterRender, audio: Uint8Array) => {
  const story = deps.stories.findStory(render.storyId);
  if (story === null) return "story_missing";
  if (story.version !== render.storyVersion) return "story_changed";
  if (story.chapters.length <= 1) return "no_plan";
  return planChapterSpans(story.lines, story.chapters, await deps.silences.findParagraphSilences(audio));
};

const storePart = async (deps: ChapterizeDeps, render: SingleChapterRender, audio: Uint8Array, span: ChapterSpan): Promise<FinishedChapter> => {
  const part = await deps.cutter.cut(audio, span);
  const sha256 = sha256Hex(part.bytes);
  const storageKey = chapterKey(render.userId, render.voiceId, render.renderId, span.index, sha256);
  await deps.storage.put(storageKey, part.bytes, CHAPTER_CONTENT_TYPE);
  return { index: span.index, role: "body", title: span.title, storageKey, durationMs: part.durationMs, bytes: part.bytes.length, sha256 };
};

// 교체하지 못하면 새로 올린 조각을 지운다. 바꿨으면 옛 장 하나를 지운다.
const splitRender = async (deps: ChapterizeDeps, render: SingleChapterRender): Promise<ChapterizeOutcome> => {
  const audio = await readObjectBytes(deps.storage, render.storageKey);
  const spans = await spansOf(deps, render, audio);
  const outcome = { renderId: render.renderId, storyId: render.storyId };
  if (typeof spans === "string") return { ...outcome, result: spans, chapters: 1 };
  const chapters = await mapInSequence(spans, (span) => storePart(deps, render, audio, span));
  const replacement = await deps.renders.replaceChapter(render, chapters);
  const replaced = replacement === "replaced";
  await deps.storage.deleteKeys(replaced ? [render.storageKey] : chapters.map((chapter) => chapter.storageKey));
  return { ...outcome, result: replaced ? "split" : replacement, chapters: replaced ? chapters.length : 1 };
};

// 한 편씩 차례로 나눈다. ffmpeg와 저장소를 한꺼번에 몰아 쓰지 않는다.
export const chapterizePublished = (deps: ChapterizeDeps) => async (): Promise<readonly ChapterizeOutcome[]> =>
  mapInSequence(await deps.renders.listSingleChapterRenders(), (render) => splitRender(deps, render));
