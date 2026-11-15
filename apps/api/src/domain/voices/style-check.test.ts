import { describe, expect, it } from "vitest";

import { isDistinctFrom, isDistinctFromEvery, prosodyOf, type Prosody, type StyleCheck } from "./style-check";

// content/scripts/recording-scripts.json의 기준과 같다. 사례는 spike의 test_reference_check.py와 같은 숫자다.
const SOFT: StyleCheck = {
  style: "soft",
  anyOf: [
    { metric: "speechRateChange", atMost: -0.05 },
    { metric: "pitchShiftSemitones", atMost: -0.5 },
  ],
};
const DEEP: StyleCheck = { style: "deep", anyOf: [{ metric: "pitchShiftSemitones", atMost: -2.0 }] };
const CHILD: StyleCheck = { style: "child", anyOf: [{ metric: "pitchShiftSemitones", atLeast: 3.0 }] };

const measured = (speechRate: number, medianSemitones: number): Prosody => ({ speechRate, medianSemitones });
const UNMEASURED: Prosody = { speechRate: null, medianSemitones: null };

describe("style check", () => {
  it.each([
    ["soft lower and slower", SOFT, measured(4.24, 100.0), measured(3.6, 99.0), true],
    ["soft like calm", SOFT, measured(4.24, 100.0), measured(4.24, 100.0), false],
    ["soft only slower", SOFT, measured(4.62, 100.0), measured(3.88, 100.1), true],
    ["soft only lower", SOFT, measured(4.24, 100.0), measured(4.24, 99.5), true],
    ["deep 2.3 semitones below", DEEP, measured(6.25, 12.92), measured(5.23, 10.62), true],
    ["deep close to calm", DEEP, measured(6.25, 12.92), measured(5.23, 11.5), false],
    ["child 4.5 semitones above", CHILD, measured(6.25, 12.92), measured(5.6, 17.42), true],
    ["child exactly at the rise", CHILD, measured(6.0, 12.0), measured(5.0, 15.0), true],
    ["child close to calm", CHILD, measured(6.25, 12.92), measured(5.6, 14.9), false],
    ["child below calm", CHILD, measured(6.25, 12.92), measured(5.6, 8.0), false],
  ])("%s", (_name, check, calm, clip, distinct) => {
    expect(isDistinctFrom(check, calm, clip)).toBe(distinct);
  });

  it.each([SOFT, DEEP, CHILD])("never passes $style on a value that could not be measured", (check) => {
    expect(isDistinctFrom(check, measured(6.25, 12.92), UNMEASURED)).toBe(false);
    expect(isDistinctFrom(check, UNMEASURED, measured(1.0, 40.0))).toBe(false);
  });

  it("does not divide by a calm that has no pace", () => {
    expect(isDistinctFrom(SOFT, measured(0, 100.0), measured(3.0, 100.0))).toBe(false);
  });

  it("has to differ from every passed calm, not just one", () => {
    const child = measured(5.6, 17.42);
    expect(isDistinctFromEvery(CHILD, [measured(6.25, 12.92), measured(6.0, 13.5)], child)).toBe(true);
    expect(isDistinctFromEvery(CHILD, [measured(6.25, 12.92), measured(6.0, 15.0)], child)).toBe(false);
  });

  it("turns syllables over voiced seconds into pace, and no speech into an unknown pace", () => {
    expect(prosodyOf({ voicedSeconds: 4, medianSemitones: 93.4 }, 20)).toEqual({ speechRate: 5, medianSemitones: 93.4 });
    expect(prosodyOf({ voicedSeconds: 0, medianSemitones: null }, 20)).toEqual({ speechRate: null, medianSemitones: null });
  });
});
