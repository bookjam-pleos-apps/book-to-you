import { describe, expect, it } from "vitest";

import { autoStopMs, durationHint, isTooShort, limitFor } from "./recording-limits";

describe("recording limits", () => {
  it("stops a little before the server's upper bound", () => {
    expect(autoStopMs("clip")).toBeLessThan(limitFor("clip").maxMs);
    expect(autoStopMs("prompt")).toBeGreaterThan(limitFor("prompt").minMs);
  });

  it("warns locally about clips the server would call too short", () => {
    expect(isTooShort("clip", 9_000)).toBe(true);
    expect(isTooShort("clip", 10_000)).toBe(false);
  });

  it("tells the parent how long to read", () => {
    expect(durationHint("clip")).toBe("10~20초 동안 읽어 주세요");
  });
});
