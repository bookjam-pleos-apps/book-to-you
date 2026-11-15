import { describe, expect, it } from "vitest";

import { hangulSyllables, isRenderableLine, unreadableMarks } from "./readable-text";

describe("hangulSyllables", () => {
  it("counts only hangul syllables", () => {
    expect(hangulSyllables("“콩이야, 어디 가니?” 하고 물었어요.")).toBe(13);
  });

  it("does not count digits or latin letters", () => {
    expect(hangulSyllables("3.5리 OK")).toBe(1);
  });
});

describe("unreadableMarks", () => {
  it.each([
    ["사과 3개와 OK 사인", ["3", "OK"]],
    ["사과 ３개와 ＯＫ 사인", ["３", "ＯＫ"]],
    ["山에 갔어요", ["山"]],
    ["토끼(아기)가 웃었어요", ["(", ")"]],
  ])("finds unreadable marks in %s", (text, marks) => {
    expect(unreadableMarks(text)).toEqual(marks);
  });

  it("finds nothing in hangul text", () => {
    expect(unreadableMarks("“사과 세 개를 먹었어요!” 하고 말했어요.")).toEqual([]);
  });
});

describe("isRenderableLine", () => {
  const hangul = (syllables: number) => "가".repeat(syllables);

  it("allows a line up to the syllable limit", () => {
    expect(isRenderableLine(hangul(180), 180)).toBe(true);
  });

  it("rejects a line over the limit or with unreadable marks", () => {
    expect(isRenderableLine(hangul(181), 180)).toBe(false);
    expect(isRenderableLine("사과 3개", 180)).toBe(false);
  });
});
