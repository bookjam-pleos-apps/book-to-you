import { CHAPTER_CONTENT_TYPE } from "../../domain/audio-content-type";
import { mapInSequence } from "../../domain/in-sequence";
import { planChapterSpans, type ChapterPlanProblem, type ChapterSpan } from "../../domain/renders/chapter-plan";
import { judgeRenderReport, type ReportLine, type ReportProblem } from "../../domain/renders/render-report";
import { sha256Hex } from "../../domain/sha256";
import { chapterKey } from "../../domain/storage-keys";
import type { ChapterEncoder } from "../ports/chapter-encoder";
import type { Clock } from "../ports/clock";
import type { ObjectStorage } from "../ports/object-storage";
import type { SilenceFinder } from "../ports/silence-finder";
import type { StoryContent, StoryContents } from "../stories";
import type { FinishedChapter, RenderRepo, RunningRender } from "./ports";

const CHAPTER_ROLE = "body";

export type PublishRenderDeps = {
  readonly renders: RenderRepo;
  readonly stories: StoryContents;
  readonly encoder: ChapterEncoder;
  readonly silences: SilenceFinder;
  readonly storage: ObjectStorage;
  readonly clock: Clock;
  readonly aiNotice: string;
};

export type PublishRenderInput = {
  readonly renderId: string;
  readonly report: readonly ReportLine[];
  readonly storyWav: Uint8Array;
};

export type PublishRenderResult =
  // chapterProblem이 있으면 장 계획대로 나누지 못해 장 하나로 올렸다.
  | { readonly kind: "published"; readonly chapterKeys: readonly string[]; readonly durationMs: number; readonly chapterProblem: ChapterPlanProblem | null }
  | { readonly kind: "not_running" | "story_changed" | "no_active_consent" | ReportProblem };

const usableStory = (deps: PublishRenderDeps, running: RunningRender): StoryContent | null => {
  const story = deps.stories.findStory(running.storyId);
  return story?.version === running.storyVersion ? story : null;
};

const failAs = async <Kind extends "story_changed" | "no_active_consent" | ReportProblem>(deps: PublishRenderDeps, renderId: string, kind: Kind): Promise<{ readonly kind: Kind }> => {
  await deps.renders.fail(renderId, kind, deps.clock());
  return { kind };
};

type ChapterSplit = { readonly spans: readonly ChapterSpan[]; readonly problem: ChapterPlanProblem | null };

const wholeStory = (title: string | null, problem: ChapterPlanProblem | null = null): ChapterSplit => ({
  spans: [{ index: 0, title, startMs: 0, endMs: null }],
  problem,
});

const chapterSplitOf = async (deps: PublishRenderDeps, story: StoryContent, wav: Uint8Array): Promise<ChapterSplit> => {
  if (story.chapters.length <= 1) return wholeStory(story.chapters[0]?.title ?? null);
  const spans = planChapterSpans(story.lines, story.chapters, await deps.silences.findParagraphSilences(wav));
  // 경계를 못 맞추면 장 하나로 올린다. GPU로 렌더한 결과를 버리는 것보다 낫다.
  return typeof spans === "string" ? wholeStory(null, spans) : { spans, problem: null };
};

const storeChapter = async (deps: PublishRenderDeps, input: PublishRenderInput, running: RunningRender, span: ChapterSpan, title: string): Promise<FinishedChapter> => {
  const range = span.startMs === 0 && span.endMs === null ? undefined : span;
  const encoded = await deps.encoder.encode(input.storyWav, { title, aiNotice: deps.aiNotice }, range);
  const sha256 = sha256Hex(encoded.bytes);
  const storageKey = chapterKey(running.userId, running.voiceId, input.renderId, span.index, sha256);
  await deps.storage.put(storageKey, encoded.bytes, CHAPTER_CONTENT_TYPE);
  return { index: span.index, role: CHAPTER_ROLE, title: span.title, storageKey, durationMs: encoded.durationMs, bytes: encoded.bytes.length, sha256 };
};

const publishedOf = (chapters: readonly FinishedChapter[], chapterProblem: ChapterPlanProblem | null): PublishRenderResult => ({
  kind: "published",
  chapterKeys: chapters.map((chapter) => chapter.storageKey),
  durationMs: chapters.reduce((total, chapter) => total + chapter.durationMs, 0),
  chapterProblem,
});

const publishChapters = async (deps: PublishRenderDeps, input: PublishRenderInput, running: RunningRender, story: StoryContent): Promise<PublishRenderResult> => {
  const { spans, problem } = await chapterSplitOf(deps, story, input.storyWav);
  const title = story.title ?? story.id;
  const chapters = await mapInSequence(spans, (span) => storeChapter(deps, input, running, span, title));
  const completion = await deps.renders.complete(input.renderId, running, chapters, deps.clock());
  if (completion === "completed") return publishedOf(chapters, problem);
  // 다른 게시가 먼저 끝났다. 내용이 같으면 키도 같으므로 지우지 않는다. 참조가 없는 객체는 고아 정리가 지운다.
  if (completion === "not_running") return { kind: "not_running" };
  // 렌더하는 동안 동의가 철회됐다. 객체를 남기면 삭제 보장이 깨진다.
  await deps.storage.deleteKeys(chapters.map((chapter) => chapter.storageKey));
  return failAs(deps, input.renderId, "no_active_consent");
};

export const publishRender =
  (deps: PublishRenderDeps) =>
  async (input: PublishRenderInput): Promise<PublishRenderResult> => {
    const running = await deps.renders.findRunning(input.renderId);
    if (running === null) return { kind: "not_running" };
    const story = usableStory(deps, running);
    if (story === null) return failAs(deps, input.renderId, "story_changed");
    const problem = judgeRenderReport(story.lines, input.report);
    if (problem !== null) return failAs(deps, input.renderId, problem);
    return publishChapters(deps, input, running, story);
  };
