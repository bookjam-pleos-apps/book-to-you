import { describe, expect, it } from "vitest";

import { chapterCount, chapterHeading, chapterTitle, nextChapter, previousChapter, segmentFills, toggleAction } from "./chapter-player";

describe("segmentFills", () => {
  it("들은 장은 꽉, 듣는 장은 들은 만큼, 남은 장은 비운다", () => {
    expect(segmentFills(3, 1, 45_000, 100_000)).toEqual([1, 0.45, 0]);
  });

  it("길이를 모르거나 위치가 길이를 넘어도 칸이 넘치지 않는다", () => {
    expect(segmentFills(2, 0, 10, 0)).toEqual([0, 0]);
    expect(segmentFills(2, 1, 120, 100)).toEqual([1, 1]);
  });
});

describe("chapter moves", () => {
  it("첫 장에는 이전이, 마지막 장에는 다음이 없다", () => {
    expect([previousChapter(0), previousChapter(2)]).toEqual([null, 1]);
    expect([nextChapter(1, 3), nextChapter(2, 3)]).toEqual([2, null]);
  });

  it("장 번호와 개수는 1부터 보인다", () => {
    expect([chapterTitle(0), chapterCount(1, 3)]).toEqual(["제1장", "2 / 3"]);
    expect([chapterHeading(1, "숲속에서 만난 늑대"), chapterHeading(0, null)]).toEqual(["제2장. 숲속에서 만난 늑대", "제1장"]);
  });
});

describe("toggleAction", () => {
  it("다 들은 뒤에는 처음부터, 아니면 지금 장을 틀거나 멈춘다", () => {
    expect([toggleAction(true), toggleAction(false)]).toEqual(["restart", "toggle"]);
  });
});
