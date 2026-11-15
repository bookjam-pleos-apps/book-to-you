import { describe, expect, it } from "vitest";

import { decideActive, decideRecovery, isCleanupDone, planWork, type WorkerRow } from "./render-worker-plan";

const POLICY = { timeoutMs: 30 * 60_000, maxSubmissions: 2, cleanupGraceMs: 3 * 60_000 };
const T0 = new Date("2026-11-12T10:00:00Z");
const minutes = (count: number): Date => new Date(T0.getTime() + count * 60_000);

const row = (renderId: string, changes: Partial<WorkerRow> = {}): WorkerRow => ({
  renderId,
  voiceId: "v1",
  storyId: "s1",
  status: "queued",
  attempts: 0,
  taskId: null,
  submittedAt: null,
  startedAt: T0,
  finishedAt: null,
  ...changes,
});

const owned = (renderId: string, changes: Partial<WorkerRow> = {}): WorkerRow =>
  row(renderId, { status: "running", attempts: 1, taskId: `task-${renderId}`, submittedAt: T0, ...changes });

describe("planWork", () => {
  it("claims the oldest queued render when nothing is running", () => {
    const plan = planWork([row("b", { startedAt: minutes(2) }), row("a", { startedAt: minutes(1) })]);

    expect(plan).toEqual({ cleanups: [], active: null, next: row("a", { startedAt: minutes(1) }) });
  });

  it("follows the render it already holds and claims nothing new", () => {
    const plan = planWork([row("q"), owned("r")]);

    expect([plan.active?.renderId, plan.next]).toEqual(["r", null]);
  });

  it("leaves an operator batch render alone and does not wait for it", () => {
    const plan = planWork([row("op", { status: "running", attempts: 1 }), row("q")]);

    expect([plan.active, plan.next?.renderId]).toEqual([null, "q"]);
  });

  it("cleans finished renders it submitted until their task is cleared", () => {
    const done = owned("done", { status: "succeeded", finishedAt: minutes(5) });
    const operatorDone = row("op", { status: "failed" });

    expect(planWork([done, operatorDone]).cleanups).toEqual([done]);
  });
});

describe("decideActive", () => {
  it.each([
    ["running", { kind: "wait" }],
    ["unreachable", { kind: "wait" }],
    ["completed", { kind: "collect" }],
    ["failed", { kind: "stop", errorCode: "render_failed" }],
    ["gone", { kind: "recover" }],
  ] as const)("reads task %s as %j within the time limit", (task, decision) => {
    expect(decideActive(owned("r"), task, minutes(10), POLICY)).toEqual(decision);
  });

  it("stops a render past the time limit even while the device is unreachable", () => {
    expect(decideActive(owned("r"), "unreachable", minutes(31), POLICY)).toEqual({ kind: "stop", errorCode: "render_timeout" });
  });

  it("still collects a render that finished just past the limit", () => {
    expect(decideActive(owned("r"), "completed", minutes(31), POLICY)).toEqual({ kind: "collect" });
  });

  it("recovers a claimed render whose task id was never saved", () => {
    expect(decideActive(owned("r", { taskId: null }), "unreachable", minutes(1), POLICY)).toEqual({ kind: "recover" });
  });
});

describe("decideRecovery", () => {
  it("resubmits once and then stops", () => {
    expect(decideRecovery(owned("r", { attempts: 1 }), POLICY)).toEqual({ kind: "resubmit" });
    expect(decideRecovery(owned("r", { attempts: 2 }), POLICY)).toEqual({ kind: "stop", errorCode: "render_lost" });
  });
});

describe("isCleanupDone", () => {
  it("keeps cleaning within the grace time even when the folder is already gone", () => {
    expect(isCleanupDone(false, minutes(0), minutes(2), POLICY)).toBe(false);
    expect(isCleanupDone(false, minutes(0), minutes(3), POLICY)).toBe(true);
  });

  it("is not done while a folder was still removed", () => {
    expect(isCleanupDone(true, minutes(0), minutes(10), POLICY)).toBe(false);
  });
});
