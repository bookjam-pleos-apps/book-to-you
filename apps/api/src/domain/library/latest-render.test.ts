import { describe, expect, it } from "vitest";

import { latestRenderIds, type RenderVersion } from "./latest-render";

const at = (iso: string) => new Date(iso);
const render = (id: string, overrides: Partial<RenderVersion> = {}): RenderVersion => ({
  id,
  voiceId: "mom",
  storyId: "masteraway",
  finishedAt: at("2026-11-08T14:00:00Z"),
  ...overrides,
});

describe("latest render per voice and story", () => {
  it("keeps only the most recently finished render of the same story in the same voice", () => {
    const older = render("b-older", { finishedAt: at("2026-11-08T14:00:00Z") });
    const newer = render("a-newer", { finishedAt: at("2026-11-08T15:00:00Z") });
    expect(latestRenderIds([older, newer])).toEqual(new Set(["a-newer"]));
  });

  it("keeps one render for each voice and each story", () => {
    const renders = [render("1"), render("2", { voiceId: "dad" }), render("3", { storyId: "redhood" })];
    expect(latestRenderIds(renders)).toEqual(new Set(["1", "2", "3"]));
  });

  it("prefers a finished time over none and settles ties by id so the choice is stable", () => {
    expect(latestRenderIds([render("x", { finishedAt: null }), render("y")])).toEqual(new Set(["y"]));
    expect(latestRenderIds([render("a"), render("b")])).toEqual(new Set(["b"]));
    expect(latestRenderIds([render("b"), render("a")])).toEqual(new Set(["b"]));
  });

  it("returns nothing for no renders", () => {
    expect(latestRenderIds([])).toEqual(new Set());
  });
});
