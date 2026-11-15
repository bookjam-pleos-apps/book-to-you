import { describe, expect, it } from "vitest";

import parityCases from "../../../../../tests/fixtures/cer-parity.json";
import { characterErrorRate } from "./cer";

describe("characterErrorRate", () => {
  it.each(parityCases)("matches the spike for $reference / $hypothesis", ({ reference, hypothesis, cer }) => {
    expect(characterErrorRate(reference, hypothesis)).toBeCloseTo(cer, 5);
  });

  it("compares decomposed text as the same characters", () => {
    expect(characterErrorRate("가나다라".normalize("NFD"), "가나다라")).toBe(0);
    expect(characterErrorRate("가나다라".normalize("NFD"), "마바사아".normalize("NFD"))).toBe(1);
  });

  it("accepts a number written as digits by the transcriber", () => {
    expect(characterErrorRate("모두 일곱 개", "모두 7개")).toBe(0);
  });

  it("ignores spacing and punctuation", () => {
    expect(characterErrorRate("와, 오늘은 소풍!", "와 오늘은소풍.")).toBe(0);
  });

  it("counts one substituted character", () => {
    expect(characterErrorRate("가나다라", "가나마라")).toBe(0.25);
  });

  it("counts missing and extra characters", () => {
    expect(characterErrorRate("가나다라", "가나다")).toBe(0.25);
    expect(characterErrorRate("가나다라", "가나다라마")).toBe(0.25);
  });

  it("treats an empty transcript as complete failure", () => {
    expect(characterErrorRate("가나", "")).toBe(1);
  });

  it("handles an empty reference without dividing by zero", () => {
    expect(characterErrorRate("", "")).toBe(0);
    expect(characterErrorRate("!", "가")).toBe(1);
  });
});
