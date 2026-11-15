import { describe, expect, it } from "vitest";

import { mapInSequence } from "./in-sequence";

describe("mapInSequence", () => {
  it("starts each step only after the previous one finished and keeps the order", async () => {
    const events: string[] = [];
    const step = async (item: number): Promise<number> => {
      events.push(`start ${item}`);
      await new Promise((resolve) => setTimeout(resolve, item === 1 ? 5 : 0));
      events.push(`end ${item}`);
      return item * 10;
    };
    expect(await mapInSequence([1, 2, 3], step)).toEqual([10, 20, 30]);
    expect(events).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  it("hands each step the results so far", async () => {
    const seen = await mapInSequence(["a", "b", "c"], async (_, done: readonly number[]) => done.length);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("stops at the first rejection", async () => {
    const started: number[] = [];
    const step = async (item: number): Promise<number> => {
      started.push(item);
      if (item === 2) throw new Error("boom");
      return item;
    };
    await expect(mapInSequence([1, 2, 3], step)).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });
});
