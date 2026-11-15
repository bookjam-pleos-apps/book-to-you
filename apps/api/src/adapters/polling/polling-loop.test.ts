import { describe, expect, it } from "vitest";

import { startPolling } from "./polling-loop";

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("startPolling", () => {
  it("never overlaps ticks, carries memory forward and waits for the running tick on stop", async () => {
    const seen: Array<string | undefined> = [];
    const state = { running: 0, maxRunning: 0, finished: 0 };
    const tick = async (memory: string | undefined): Promise<string | undefined> => {
      state.running += 1;
      state.maxRunning = Math.max(state.maxRunning, state.running);
      seen.push(memory);
      await settle(5);
      state.running -= 1;
      state.finished += 1;
      return `r${seen.length}`;
    };

    const polling = startPolling(tick, { initial: undefined, intervalMs: 1, onError: () => undefined });
    await settle(40);
    await polling.stop();
    const finishedAtStop = state.finished;
    await settle(20);

    expect(state.maxRunning).toBe(1);
    expect(seen.slice(0, 3)).toEqual([undefined, "r1", "r2"]);
    expect([state.running, state.finished]).toEqual([0, finishedAtStop]);
  });

  it("keeps polling after a tick throws", async () => {
    const calls = { count: 0 };
    const errors: unknown[] = [];
    const tick = async (memory: number): Promise<number> => {
      calls.count += 1;
      if (calls.count === 1) throw new Error("db down");
      return memory;
    };

    const polling = startPolling(tick, { initial: 0, intervalMs: 1, onError: (error) => errors.push(error) });
    await settle(20);
    await polling.stop();

    expect(calls.count).toBeGreaterThan(1);
    expect(errors).toHaveLength(1);
  });
});
