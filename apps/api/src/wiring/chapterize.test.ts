import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { consentRecords, renderChapters, renders, users } from "../adapters/db/schema";
import type { AudioRange } from "../application/ports/chapter-encoder";
import type { StoryContent } from "../application/stories";
import { seedPlayableRender, seedPlayableVoice } from "../testing/demo-seed";
import { createTestRuntime, type TestRuntime } from "../testing/test-runtime";
import { wireChapterize } from "./chapterize";

const USER_ID = "00000000-0000-4000-8000-0000000000c1";
const WHOLE = new TextEncoder().encode("whole chapter");
// demo-seed가 masteraway v1로 렌더를 심는다.
const STORY: StoryContent = {
  id: "masteraway",
  title: "주인이 없는 날",
  version: "v1",
  lines: [
    { text: "하나.", style: "calm", pauseAfterMs: 900 },
    { text: "둘.", style: "calm", pauseAfterMs: 900 },
  ],
  chapters: [{ from: 0, title: "처음" }, { from: 1, title: "끝" }],
};
const SILENCES = [{ startMs: 1000, endMs: 2000 }, { startMs: 4000, endMs: 4900 }];

describe("splitting published single-chapter renders", () => {
  let runtime: TestRuntime;
  let renderId: string;
  const cuts: AudioRange[] = [];

  const chapterize = (story: StoryContent, silences = SILENCES) =>
    wireChapterize({
      database: runtime.database,
      storage: runtime.storage,
      stories: { findStory: (id) => (id === story.id ? story : null) },
      silences: { findParagraphSilences: async () => silences },
      cutter: { cut: async (_, range) => (cuts.push(range), { bytes: new TextEncoder().encode(`part ${range.startMs}`), durationMs: 1500 }) },
    })();

  const chaptersOf = () =>
    runtime.database.select().from(renderChapters).where(eq(renderChapters.renderId, renderId)).orderBy(asc(renderChapters.index));

  beforeEach(async () => {
    cuts.length = 0;
    runtime = await createTestRuntime();
    await runtime.database.insert(users).values({ id: USER_ID, email: "parent@example.com" });
    const voiceId = await seedPlayableVoice(runtime, USER_ID, { label: "엄마", bytes: WHOLE });
    renderId = (await runtime.database.select({ id: renders.id }).from(renders).where(eq(renders.voiceProfileId, voiceId)))[0]?.id ?? "";
  });

  it("replaces the single chapter with titled parts and removes the old audio", async () => {
    const [before] = await chaptersOf();
    expect(await chapterize(STORY)).toEqual([{ renderId, storyId: "masteraway", result: "split", chapters: 2 }]);
    expect(cuts).toEqual([{ index: 0, title: "처음", startMs: 0, endMs: 1500 }, { index: 1, title: "끝", startMs: 1500, endMs: null }]);
    expect((await chaptersOf()).map(({ index, title }) => ({ index, title }))).toEqual([{ index: 0, title: "처음" }, { index: 1, title: "끝" }]);
    expect((await runtime.database.select().from(renders).where(eq(renders.id, renderId)))[0]).toMatchObject({ chaptersTotal: 2, chaptersDone: 2 });
    expect((await runtime.storage.list("u/")).map(({ key }) => key)).not.toContain(before?.storageKey);
  });

  it("does nothing a second time", async () => {
    await chapterize(STORY);
    expect(await chapterize(STORY)).toEqual([]);
  });

  it("leaves the render alone when the pauses cannot be matched or there is no plan", async () => {
    expect(await chapterize(STORY, SILENCES.slice(1))).toMatchObject([{ result: "chapter_silences_mismatch", chapters: 1 }]);
    expect(await chapterize({ ...STORY, chapters: [] })).toMatchObject([{ result: "no_plan" }]);
    expect(await chapterize({ ...STORY, version: "v2" })).toMatchObject([{ result: "story_changed" }]);
    expect(await chaptersOf()).toHaveLength(1);
    expect(cuts).toEqual([]);
  });

  it("writes nothing when consent was withdrawn", async () => {
    await runtime.database.update(consentRecords).set({ status: "revoked" });
    const before = (await runtime.storage.list("u/")).map(({ key }) => key);
    expect(await chapterize(STORY)).toMatchObject([{ result: "no_active_consent", chapters: 1 }]);
    expect(await chaptersOf()).toHaveLength(1);
    expect((await runtime.storage.list("u/")).map(({ key }) => key)).toEqual(before);
  });

  it("leaves renders of a story missing from the catalog untouched", async () => {
    await seedPlayableRender(runtime, USER_ID, (await runtime.database.select().from(renders))[0]?.voiceProfileId ?? "", WHOLE);
    const outcomes = await chapterize({ ...STORY, id: "other" });
    expect(outcomes.map((outcome) => outcome.result)).toEqual(["story_missing", "story_missing"]);
  });
});
