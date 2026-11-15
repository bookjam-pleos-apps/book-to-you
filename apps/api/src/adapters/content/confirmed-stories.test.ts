import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { POLICY } from "../../config";
import { hangulSyllables, unreadableMarks } from "../../domain/stories/readable-text";
import { readConfirmedStories } from "./story-catalog";

const CONTENT = resolve(import.meta.dirname, "../../../../../content/stories");
const { maxSyllables } = POLICY.batchRender.limits;

const lines = readConfirmedStories(CONTENT).flatMap((story) => story.lines.map((line, index) => [`${story.id} ${index}`, line.text] as const));

describe("confirmed story sentences", () => {
  it.each(lines)("%s fits one render unit", (_, text) => {
    expect(hangulSyllables(text)).toBeLessThanOrEqual(maxSyllables);
  });

  it.each(lines)("%s is written out in hangul", (_, text) => {
    expect(unreadableMarks(text)).toEqual([]);
  });
});
