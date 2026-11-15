import { describe, expect, it } from "vitest";

import { createConcurrencyLimit } from "./concurrency-limit";

describe("concurrency limit", () => {
  it("never runs more than the limit and finishes everything", async () => {
    const limit = createConcurrencyLimit(2);
    const seen = { running: 0, peak: 0 };
    const task = async (value: number) => {
      seen.running += 1;
      seen.peak = Math.max(seen.peak, seen.running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      seen.running -= 1;
      return value;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((value) => limit(() => task(value))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(seen.peak).toBe(2);
  });

  it("releases its slot when a task fails", async () => {
    const limit = createConcurrencyLimit(1);
    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limit(async () => "next")).resolves.toBe("next");
  });
});
