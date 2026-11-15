import { describe, expect, it } from "vitest";

import { baseSeedOf } from "./retry-seed";

describe("baseSeedOf", () => {
  it("keeps the policy seed for a first request and moves it by one per earlier failure", () => {
    expect([0, 1, 2].map((failures) => baseSeedOf(1234, failures))).toEqual([1234, 1235, 1236]);
  });

  it("stays within one attempt step so retried seeds never reach another request's later attempts", () => {
    const attemptSeeds = (failures: number) => [0, 1, 2].map((attempt) => baseSeedOf(1234, failures) + attempt * 1000);
    const seen = [0, 1, 999].flatMap(attemptSeeds);
    expect(new Set(seen).size).toBe(seen.length);
    expect(baseSeedOf(1234, 1000)).toBe(1234);
  });
});
