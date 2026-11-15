import { describe, expect, it } from "vitest";

import { renderKey, type RenderKeyParts } from "./render-key";

const parts: RenderKeyParts = {
  voiceId: "voice",
  storyId: "story",
  storyVersion: "v1",
  refClipIds: ["clip-a", "clip-b"],
  engineId: "qwen3-base",
  engineVersion: "1.7B",
  assemblyVersion: "1",
};
const identity = (input: string): string => input;

describe("renderKey", () => {
  it("ignores the order of reference clips", () => {
    const reordered = { ...parts, refClipIds: ["clip-b", "clip-a"] };
    expect(renderKey(reordered, identity)).toBe(renderKey(parts, identity));
  });

  it.each([
    ["voiceId", "other"],
    ["storyVersion", "v2"],
    ["engineVersion", "0.6B"],
    ["assemblyVersion", "2"],
  ])("changes when %s changes", (field, value) => {
    expect(renderKey({ ...parts, [field]: value }, identity)).not.toBe(renderKey(parts, identity));
  });

  it("changes when a reference clip changes", () => {
    const changed = { ...parts, refClipIds: ["clip-a", "clip-c"] };
    expect(renderKey(changed, identity)).not.toBe(renderKey(parts, identity));
  });

  it("does not confuse values across field boundaries", () => {
    const shifted = { ...parts, voiceId: "voicestory", storyId: "" };
    expect(renderKey(shifted, identity)).not.toBe(renderKey(parts, identity));
  });
});
