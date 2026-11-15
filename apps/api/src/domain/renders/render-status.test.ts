import { describe, expect, it } from "vitest";

import { statusOfRender, summarizePairs, type RenderRow } from "./render-status";

const row = (overrides: Partial<RenderRow> & Pick<RenderRow, "renderId">): RenderRow => ({
  voiceId: "v-1",
  voiceLabel: "엄마",
  storyId: "s-1",
  status: "succeeded",
  consentActive: true,
  startedAt: new Date("2026-11-12T01:00:00Z"),
  ...overrides,
});

const statusesOf = (rows: readonly RenderRow[]) => summarizePairs(rows).map(({ renderId, status }) => ({ renderId, status }));

describe("summarizePairs", () => {
  it("is making while any render of the pair is running, even if an older one succeeded", () => {
    const rows = [row({ renderId: "old" }), row({ renderId: "new", status: "running" })];
    expect(statusesOf(rows)).toEqual([{ renderId: "new", status: "making" }]);
  });

  it("treats a queued render as making", () => {
    expect(statusesOf([row({ renderId: "q", status: "queued", startedAt: null })])).toEqual([{ renderId: "q", status: "making" }]);
  });

  it("is playable when a succeeded render has active consent, even after a later failure", () => {
    const rows = [row({ renderId: "ok" }), row({ renderId: "bad", status: "failed", startedAt: new Date("2026-11-12T02:00:00Z") })];
    expect(statusesOf(rows)).toEqual([{ renderId: "ok", status: "playable" }]);
  });

  it("is failed when the only success lost its consent", () => {
    expect(statusesOf([row({ renderId: "revoked", consentActive: false })])).toEqual([{ renderId: "revoked", status: "failed" }]);
  });

  it("is failed when nothing succeeded", () => {
    expect(statusesOf([row({ renderId: "bad", status: "failed" })])).toEqual([{ renderId: "bad", status: "failed" }]);
  });

  it("shows the newest of several playable renders", () => {
    const rows = [row({ renderId: "a" }), row({ renderId: "b", startedAt: new Date("2026-11-12T03:00:00Z") })];
    expect(statusesOf(rows)).toEqual([{ renderId: "b", status: "playable" }]);
  });

  it("keeps one line per voice and story pair, newest first", () => {
    const rows = [
      row({ renderId: "old-pair" }),
      row({ renderId: "other-voice", voiceId: "v-2", startedAt: new Date("2026-11-12T05:00:00Z") }),
      row({ renderId: "other-story", storyId: "s-2", startedAt: new Date("2026-11-12T03:00:00Z") }),
    ];
    expect(summarizePairs(rows).map((summary) => summary.renderId)).toEqual(["other-voice", "other-story", "old-pair"]);
  });

  it("puts renders without a start time last and breaks ties by id", () => {
    const rows = [
      row({ renderId: "no-time", storyId: "s-3", startedAt: null }),
      row({ renderId: "a", storyId: "s-4" }),
      row({ renderId: "b", storyId: "s-5" }),
    ];
    expect(summarizePairs(rows).map((summary) => summary.renderId)).toEqual(["b", "a", "no-time"]);
  });

  it("returns nothing for no renders and does not reorder the input", () => {
    const rows = [row({ renderId: "a" }), row({ renderId: "b", status: "failed" })];
    const before = structuredClone(rows);
    expect(summarizePairs([])).toEqual([]);
    summarizePairs(rows);
    expect(rows).toEqual(before);
  });

  it("judges a single render by the same priority", () => {
    expect(statusOfRender(row({ renderId: "q", status: "queued" }))).toBe("making");
    expect(statusOfRender(row({ renderId: "ok" }))).toBe("playable");
    expect(statusOfRender(row({ renderId: "revoked", consentActive: false }))).toBe("failed");
    expect(statusOfRender(row({ renderId: "bad", status: "failed" }))).toBe("failed");
  });
});
