import { describe, expect, it } from "vitest";

import { judgeSignal, measureSignal } from "./signal-qc";

const RATE = 24000;
const DURATION = { minMs: 10_000, maxMs: 20_000 };
const LIMITS = { maxClippedRatio: 0.001, maxNoiseFloorDb: -35, minPeakDb: -30 };
const CLEAN = { clippedRatio: 0, noiseFloorDb: -60, peakDb: -6 };

const speechWithGaps = (amplitude: number): Int16Array =>
  Int16Array.from({ length: RATE }, (_, index) =>
    index % RATE < RATE * 0.7 ? Math.round(amplitude * Math.sin((2 * Math.PI * 220 * index) / RATE)) : 0,
  );

describe("measureSignal", () => {
  it("finds the quiet gaps between words as the noise floor", () => {
    const signal = measureSignal(speechWithGaps(10_000), RATE);
    expect(signal.noiseFloorDb).toBe(-120);
    expect(signal.peakDb).toBeCloseTo(-10.3, 0);
    expect(signal.clippedRatio).toBe(0);
  });

  it("counts samples at full scale as clipped", () => {
    const clipped = Int16Array.from({ length: RATE }, (_, index) => (index % 10 === 0 ? 32767 : 1000));
    expect(measureSignal(clipped, RATE).clippedRatio).toBeCloseTo(0.1, 3);
  });

  it("raises the noise floor when background noise fills the gaps", () => {
    const noisy = speechWithGaps(10_000).map((sample, index) => sample + (index % 2 === 0 ? 2000 : -2000));
    expect(measureSignal(noisy, RATE).noiseFloorDb).toBeGreaterThan(-35);
  });

  it("does not fail on an empty recording", () => {
    expect(measureSignal(new Int16Array(0), RATE)).toEqual({ clippedRatio: 0, noiseFloorDb: -120, peakDb: -120 });
  });
});

describe("judgeSignal", () => {
  it("passes a clean recording of the right length", () => {
    expect(judgeSignal(CLEAN, 15_000, DURATION, LIMITS)).toEqual([]);
  });

  it.each([
    ["too_short", CLEAN, 9_999],
    ["too_long", CLEAN, 20_001],
    ["clipped", { ...CLEAN, clippedRatio: 0.002 }, 15_000],
    ["too_noisy", { ...CLEAN, noiseFloorDb: -30 }, 15_000],
    ["too_quiet", { ...CLEAN, peakDb: -40 }, 15_000],
  ])("rejects %s", (rejection, signal, durationMs) => {
    expect(judgeSignal(signal, durationMs, DURATION, LIMITS)).toEqual([rejection]);
  });

  it("reports every problem at once", () => {
    const rejections = judgeSignal({ ...CLEAN, clippedRatio: 1, peakDb: -40 }, 1_000, DURATION, LIMITS);
    expect(rejections).toEqual(["too_short", "clipped", "too_quiet"]);
  });
});
