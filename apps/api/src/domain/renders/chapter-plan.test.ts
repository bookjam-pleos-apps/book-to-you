import { describe, expect, it } from "vitest";

import { chapterCountOf, firstInvalidChapter, isValidChapterPlan, planChapterSpans } from "./chapter-plan";
import type { StoryLine } from "../stories/story-version";

const line = (pauseAfterMs: number): StoryLine => ({ text: "문장.", style: "calm", pauseAfterMs });

// 문단 쉼은 1, 3, 5번 문장 뒤에 있다(마지막 문장 뒤 포함).
const STORY: readonly StoryLine[] = [line(450), line(900), line(450), line(900), line(300), line(900)];
const SILENCES = [
  { startMs: 1000, endMs: 2000 },
  { startMs: 5000, endMs: 6000 },
  { startMs: 9000, endMs: 9900 },
];

describe("chapter plan", () => {
  it("accepts no plan and plans that start at 0 and break only after paragraph pauses", () => {
    expect(isValidChapterPlan(STORY, [])).toBe(true);
    expect(isValidChapterPlan(STORY, [{ from: 0, title: "가" }, { from: 2, title: "나" }])).toBe(true);
  });

  it("refuses plans that skip the start, go backwards or break mid-paragraph", () => {
    expect(isValidChapterPlan(STORY, [{ from: 2, title: "가" }])).toBe(false);
    expect(isValidChapterPlan(STORY, [{ from: 0, title: "가" }, { from: 4, title: "나" }, { from: 2, title: "다" }])).toBe(false);
    expect(isValidChapterPlan(STORY, [{ from: 0, title: "가" }, { from: 1, title: "나" }])).toBe(false);
    expect(isValidChapterPlan(STORY, [{ from: 0, title: "가" }, { from: 6, title: "나" }])).toBe(false);
  });

  it("names the first chapter that breaks the rules", () => {
    expect(firstInvalidChapter(STORY, [{ from: 0, title: "가" }, { from: 2, title: "나" }, { from: 3, title: "다" }])).toBe(2);
    expect(firstInvalidChapter(STORY, [{ from: 1, title: "가" }])).toBe(0);
    expect(firstInvalidChapter(STORY, [{ from: 0, title: "가" }])).toBeNull();
  });

  it("counts a story without a plan as one chapter", () => {
    expect(chapterCountOf([])).toBe(1);
    expect(chapterCountOf([{ from: 0, title: "가" }, { from: 2, title: "나" }])).toBe(2);
  });
});

describe("chapter spans", () => {
  it("keeps the whole audio as one chapter without a plan, whatever the silences", () => {
    expect(planChapterSpans(STORY, [], [])).toEqual([{ index: 0, title: null, startMs: 0, endMs: null }]);
  });

  it("cuts in the middle of the silence that follows each chapter's previous paragraph", () => {
    const plan = [{ from: 0, title: "가" }, { from: 2, title: "나" }, { from: 4, title: "다" }];
    expect(planChapterSpans(STORY, plan, SILENCES)).toEqual([
      { index: 0, title: "가", startMs: 0, endMs: 1500 },
      { index: 1, title: "나", startMs: 1500, endMs: 5500 },
      { index: 2, title: "다", startMs: 5500, endMs: null },
    ]);
  });

  it("stops when the silences do not match the paragraph pauses one to one", () => {
    const plan = [{ from: 0, title: "가" }, { from: 4, title: "나" }];
    expect(planChapterSpans(STORY, plan, SILENCES.slice(1))).toBe("chapter_silences_mismatch");
    expect(planChapterSpans(STORY, [{ from: 0, title: "가" }, { from: 1, title: "나" }], SILENCES)).toBe("chapter_plan_invalid");
  });
});
