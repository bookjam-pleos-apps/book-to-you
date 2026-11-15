import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadStoryCatalog, readConfirmedStories } from "./story-catalog";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

const CONTENT = resolve(import.meta.dirname, "../../../../../content/stories");

describe("confirmed stories in the repo", () => {
  const stories = readConfirmedStories(CONTENT);

  it("finds the confirmed stories", () => {
    expect(stories.length).toBeGreaterThan(0);
  });

  it.each(stories.map((story) => [story.id, story] as const))("%s has its title and speaks it first", (_, story) => {
    expect(story.title).not.toBeNull();
    expect(story.lines[0]?.text).toBe(story.title);
  });
});

describe("story catalog", () => {
  const catalog = loadStoryCatalog(FIXTURES);

  it("finds the title of a confirmed story", () => {
    expect(catalog.findTitle("toto-picnic")).toBe("토토의 소풍");
  });

  it("has no title for a story without one, an unknown story or a draft", () => {
    expect(catalog.findTitle("untitled")).toBeNull();
    expect(catalog.findTitle("nope")).toBeNull();
    expect(catalog.findTitle("draft-only")).toBeNull();
  });

  it("does not read an annotation file as a story", () => {
    expect(catalog.findTitle("annotated-only")).toBeNull();
    expect(catalog.findStory("annotated-only")).toBeNull();
  });

  it("gives the story lines and a version that ignores the title", () => {
    const story = catalog.findStory("toto-picnic");
    expect(story?.lines).toEqual([]);
    expect(story?.version).toBe(catalog.findStory("untitled")?.version);
  });

  it("is empty when the content folder does not exist yet", () => {
    expect(loadStoryCatalog(resolve(FIXTURES, "missing")).findTitle("toto-picnic")).toBeNull();
  });
});

describe("chapter plans", () => {
  const storyWith = (chapters: readonly { from: number; title: string }[]): string => {
    const directory = mkdtempSync(join(tmpdir(), "story-catalog-"));
    const sentences = [{ text: "하나.", style: "calm", pauseAfterMs: 450 }, { text: "둘.", style: "calm", pauseAfterMs: 900 }];
    writeFileSync(join(directory, "s.json"), JSON.stringify({ id: "s", sentences, chapters }));
    return directory;
  };

  it("reads the plan, or none when the story has no chapters", () => {
    expect(readConfirmedStories(storyWith([{ from: 0, title: "처음" }]))[0]?.chapters).toEqual([{ from: 0, title: "처음" }]);
    expect(readConfirmedStories(FIXTURES).every((story) => story.chapters.length === 0)).toBe(true);
  });

  it("refuses to load a plan that breaks mid-paragraph, naming the chapter", () => {
    expect(() => readConfirmedStories(storyWith([{ from: 0, title: "처음" }, { from: 1, title: "둘" }]))).toThrow(/chapters\[1\] \(from 1\)/);
  });
});
