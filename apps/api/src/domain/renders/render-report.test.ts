import { describe, expect, it } from "vitest";

import { judgeRenderReport } from "./render-report";
import { storyVersion, type StoryLine } from "../stories/story-version";

const STORY: readonly StoryLine[] = [
  { text: "첫 문장.", style: "calm", pauseAfterMs: 450 },
  { text: "둘째 문장.", style: "excited", pauseAfterMs: 900 },
];

describe("render report", () => {
  it("accepts units that join back into the story and all passed", () => {
    expect(judgeRenderReport(STORY, [{ text: "첫 문장. 둘째 문장.", passed: true }])).toBeNull();
    expect(judgeRenderReport(STORY, [{ text: "첫 문장.", passed: true }, { text: "둘째 문장.", passed: true }])).toBeNull();
  });

  it("refuses a unit that failed sentence QC", () => {
    const report = [{ text: "첫 문장.", passed: true }, { text: "둘째 문장.", passed: false }];
    expect(judgeRenderReport(STORY, report)).toBe("sentence_qc_failed");
  });

  it("refuses an empty, cut or different render even when every unit passed", () => {
    expect(judgeRenderReport(STORY, [])).toBe("script_mismatch");
    expect(judgeRenderReport(STORY, [{ text: "첫 문장.", passed: true }])).toBe("script_mismatch");
    expect(judgeRenderReport(STORY, [{ text: "다른 이야기.", passed: true }])).toBe("script_mismatch");
  });
});

describe("story version", () => {
  const hash = (input: string): string => input;

  it("changes with text, style or pause and ignores everything else", () => {
    const base = storyVersion(STORY, hash);
    expect(storyVersion([{ ...STORY[0]!, style: "soft" }, STORY[1]!], hash)).not.toBe(base);
    expect(storyVersion([{ ...STORY[0]!, pauseAfterMs: 1 }, STORY[1]!], hash)).not.toBe(base);
    const annotated = STORY.map((line) => ({ ...line, speaker: "토끼" }));
    expect(storyVersion(annotated, hash)).toBe(base);
  });
});
