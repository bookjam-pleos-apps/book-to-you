import { describe, expect, it } from "vitest";

import { isSilentTake, meterStep, METER_STEP_COUNT, peakOf } from "./input-level";

describe("input level", () => {
  it("takes the loudest sample regardless of sign", () => {
    expect(peakOf([0.1, -0.4, 0.2])).toBe(0.4);
    expect(peakOf([])).toBe(0);
  });

  it("flags a take that never rose above -40 dBFS as silent", () => {
    expect(isSilentTake(0)).toBe(true);
    expect(isSilentTake(0.005)).toBe(true);
    expect(isSilentTake(0.05)).toBe(false);
  });

  it("does not block a take whose level could not be measured", () => {
    expect(isSilentTake(null)).toBe(false);
  });

  it("maps silence to no bars and full scale to every bar", () => {
    expect(meterStep(0)).toBe(0);
    expect(meterStep(0.01)).toBe(0);
    expect(meterStep(0.1)).toBe(3);
    expect(meterStep(1)).toBe(METER_STEP_COUNT);
  });
});
