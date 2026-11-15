import { describe, expect, it } from "vitest";

import { nativeReadings, readingCandidates, sinoReading } from "./korean-numerals";

describe("sinoReading", () => {
  it.each([
    [0, "영"],
    [10, "십"],
    [105, "백오"],
    [2024, "이천이십사"],
    [10000, "만"],
    [35000, "삼만오천"],
  ])("reads %i as %s", (n, reading) => {
    expect(sinoReading(n)).toBe(reading);
  });
});

describe("nativeReadings", () => {
  it("includes attributive forms", () => {
    expect(nativeReadings(1)).toEqual(["하나", "한"]);
    expect(nativeReadings(20)).toEqual(["스물", "스무"]);
  });

  it("stops at 99", () => {
    expect(nativeReadings(100)).toEqual([]);
  });
});

describe("readingCandidates", () => {
  it("leaves text without digits unchanged", () => {
    expect(readingCandidates("토토")).toEqual(["토토"]);
  });

  it("expands one number into every reading", () => {
    expect(readingCandidates("1개")).toEqual(["일개", "하나개", "한개"]);
  });

  it("treats a thousands comma as part of the number", () => {
    expect(readingCandidates("35,000원")).toEqual(["삼만오천원"]);
  });

  it("limits many numbers to the sino reading", () => {
    expect(readingCandidates("1 2 3 4 5")).toEqual(["일 이 삼 사 오"]);
  });
});
