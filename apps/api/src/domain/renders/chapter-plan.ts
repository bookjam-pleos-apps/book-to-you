import type { StoryLine } from "../stories/story-version";

// 렌더러(gpu/spike story_units.PARAGRAPH_PAUSE_MS)는 이 쉼을 넘어서 문장을 합치지 않고, 쉼 자리에 디지털 무음을 넣는다.
export const PARAGRAPH_PAUSE_MS = 900;

export type ChapterPlan = {
  readonly from: number;
  readonly title: string;
};

export type Silence = {
  readonly startMs: number;
  readonly endMs: number;
};

export type ChapterSpan = {
  readonly index: number;
  readonly title: string | null;
  readonly startMs: number;
  readonly endMs: number | null;
};

export type ChapterPlanProblem = "chapter_plan_invalid" | "chapter_silences_mismatch";

const paragraphEnds = (lines: readonly StoryLine[]): readonly number[] =>
  lines.flatMap((line, index) => (line.pauseAfterMs >= PARAGRAPH_PAUSE_MS ? [index] : []));

const startsAfterParagraph = (lines: readonly StoryLine[], from: number): boolean =>
  from > 0 && from < lines.length && (lines[from - 1]?.pauseAfterMs ?? 0) >= PARAGRAPH_PAUSE_MS;

const isChapterStart = (lines: readonly StoryLine[], plan: readonly ChapterPlan[], index: number): boolean => {
  const from = plan[index]?.from ?? -1;
  if (index === 0) return from === 0;
  return from > (plan[index - 1]?.from ?? from) && startsAfterParagraph(lines, from);
};

// 처음으로 잘못된 장의 index다. 0에서 시작하지 않거나, 앞 장보다 앞이거나, 문단 쉼 뒤가 아니면 잘못이다.
export const firstInvalidChapter = (lines: readonly StoryLine[], plan: readonly ChapterPlan[]): number | null => {
  const invalid = plan.findIndex((_, index) => !isChapterStart(lines, plan, index));
  return invalid < 0 ? null : invalid;
};

export const isValidChapterPlan = (lines: readonly StoryLine[], plan: readonly ChapterPlan[]): boolean => firstInvalidChapter(lines, plan) === null;

export const chapterCountOf = (plan: readonly ChapterPlan[]): number => Math.max(plan.length, 1);

const middleOf = (silence: Silence): number => Math.round((silence.startMs + silence.endMs) / 2);

// 검증을 마친 계획이라 각 장 앞의 문단 쉼에 맞는 무음이 있다.
const cutsOf = (lines: readonly StoryLine[], plan: readonly ChapterPlan[], silences: readonly Silence[]): readonly number[] => {
  const ends = paragraphEnds(lines);
  return plan.slice(1).flatMap((chapter) => {
    const silence = silences[ends.indexOf(chapter.from - 1)];
    return silence === undefined ? [] : [middleOf(silence)];
  });
};

// 무음 수가 원고의 문단 쉼 수와 정확히 같을 때만 순서대로 맞춘다. 다르면 엉뚱한 곳을 자르지 않고 멈춘다.
export const planChapterSpans = (
  lines: readonly StoryLine[],
  plan: readonly ChapterPlan[],
  silences: readonly Silence[],
): readonly ChapterSpan[] | ChapterPlanProblem => {
  if (!isValidChapterPlan(lines, plan)) return "chapter_plan_invalid";
  if (plan.length <= 1) return [{ index: 0, title: plan[0]?.title ?? null, startMs: 0, endMs: null }];
  if (silences.length !== paragraphEnds(lines).length) return "chapter_silences_mismatch";
  const cuts = cutsOf(lines, plan, silences);
  const starts = [0, ...cuts];
  return plan.map((chapter, index) => ({ index, title: chapter.title, startMs: starts[index] ?? 0, endMs: cuts[index] ?? null }));
};
