import { describe, expect, it } from "vitest";

import { formatClock, playbackPercent } from "./clock";

describe("formatClock", () => {
  it("formats m:ss with two-digit seconds", () => {
    expect(formatClock(12_400)).toBe("0:12");
    expect(formatClock(65_000)).toBe("1:05");
  });
});

describe("playbackPercent", () => {
  it("gives the position as a percent of the take length", () => {
    expect(playbackPercent(5_000, 20_000)).toBe(25);
  });

  it("clamps to 0..100", () => {
    expect(playbackPercent(21_000, 20_000)).toBe(100);
    expect(playbackPercent(-1, 20_000)).toBe(0);
  });

  it("is 0 when the length is unknown", () => {
    expect(playbackPercent(1_000, 0)).toBe(0);
  });
});
