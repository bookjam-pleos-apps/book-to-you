import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { consentRecords, voiceProfiles } from "../../adapters/db/schema";
import { sha256Hex } from "../../domain/sha256";
import { CHAPTER, createBatchHarness, GOOD_REPORT, STORY, STORY_WAV } from "../../testing/batch-render-harness";
import { publishRender } from "./publish-render";

describe("batch render publish", () => {
  let h: Awaited<ReturnType<typeof createBatchHarness>>;

  beforeEach(async () => {
    h = await createBatchHarness();
  });

  it("reaches the same manifest and audio path with the AI notice", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    const result = await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
    expect(result).toMatchObject({ kind: "published", durationMs: 1234 });
    expect(h.state.notices).toEqual(["AI 고지"]);
    const [listed] = (await h.manifest()).stories;
    expect(listed).toMatchObject({ renderId: job.renderId, title: "토토의 소풍", chapters: [{ index: 0, role: "body", durationMs: 1234, bytes: CHAPTER.length }] });
    const audio = await h.runtime.app.request(listed?.chapters[0]?.audioUrl ?? "", { headers: { cookie: h.cookie } });
    expect(audio.status).toBe(200);
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(CHAPTER);
  });

  describe("with a chapter plan", () => {
    const CHAPTERED = {
      ...STORY,
      lines: STORY.lines.map((line) => ({ ...line, pauseAfterMs: 900 })),
      chapters: [{ from: 0, title: "처음" }, { from: 1, title: "끝" }],
    };
    const SILENCES = [{ startMs: 1000, endMs: 2000 }, { startMs: 4000, endMs: 4900 }];

    it("cuts the story into titled chapters in the middle of the paragraph pause", async () => {
      h.state.story = CHAPTERED;
      h.state.silences = SILENCES;
      const { voiceId } = await h.readyVoice();
      const { job } = await h.startedJob(voiceId);
      expect(await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV })).toMatchObject({ kind: "published", durationMs: 2468, chapterProblem: null });
      expect(h.state.ranges).toEqual([{ index: 0, title: "처음", startMs: 0, endMs: 1500 }, { index: 1, title: "끝", startMs: 1500, endMs: null }]);
      const chapters = (await h.manifest()).stories[0]?.chapters;
      expect(chapters?.map(({ index, title }) => ({ index, title }))).toEqual([{ index: 0, title: "처음" }, { index: 1, title: "끝" }]);
      expect(await h.renderRow(job.renderId)).toMatchObject({ chaptersDone: 2 });
    });

    it("publishes one untitled chapter when the pauses cannot be matched", async () => {
      h.state.story = CHAPTERED;
      h.state.silences = SILENCES.slice(1);
      const { voiceId } = await h.readyVoice();
      const { job } = await h.startedJob(voiceId);
      const result = await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
      expect(result).toMatchObject({ kind: "published", chapterProblem: "chapter_silences_mismatch" });
      expect(await h.renderRow(job.renderId)).toMatchObject({ chaptersTotal: 1, chaptersDone: 1 });
      expect(h.state.ranges).toEqual([undefined]);
      expect((await h.manifest()).stories[0]?.chapters.map(({ title }) => title)).toEqual([null]);
    });
  });

  it("fails the render and writes nothing when sentence QC failed", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    const before = (await h.runtime.storage.list("u/")).length;
    const result = await h.publish({ renderId: job.renderId, report: [{ text: GOOD_REPORT[0]?.text ?? "", passed: false }], storyWav: STORY_WAV });
    expect(result).toEqual({ kind: "sentence_qc_failed" });
    expect(await h.renderRow(job.renderId)).toMatchObject({ status: "failed", errorCode: "sentence_qc_failed" });
    expect(await h.runtime.storage.list("u/")).toHaveLength(before);
    expect((await h.manifest()).stories).toEqual([]);
  });

  it("refuses a render of other text", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    expect(await h.publish({ renderId: job.renderId, report: [{ text: "다른 글", passed: true }], storyWav: STORY_WAV })).toEqual({ kind: "script_mismatch" });
  });

  it("refuses when the story changed during the render", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    h.state.story = { ...STORY, version: "v2" };
    expect(await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV })).toEqual({ kind: "story_changed" });
  });

  it("drops the chapter when consent is withdrawn during the render", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    await h.runtime.database.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.voiceProfileId, voiceId));
    const before = (await h.runtime.storage.list("u/")).length;
    expect(await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV })).toEqual({ kind: "no_active_consent" });
    expect(await h.runtime.storage.list("u/")).toHaveLength(before);
    expect(await h.renderRow(job.renderId)).toMatchObject({ status: "failed", errorCode: "no_active_consent" });
  });

  it("leaves the winner intact when two publishes overlap", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    const running = await h.repo.findRunning(job.renderId);
    await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
    const loser = publishRender({
      ...h.publishDeps,
      renders: { ...h.repo, findRunning: async () => running },
      encoder: h.encoder(new TextEncoder().encode("different")),
    });
    expect(await loser({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV })).toEqual({ kind: "not_running" });
    expect(await h.renderRow(job.renderId)).toMatchObject({ status: "succeeded", errorCode: null });
    const chapter = (await h.manifest()).stories[0]?.chapters[0];
    expect(chapter?.sha256).toBe(sha256Hex(CHAPTER));
    const audio = await h.runtime.app.request(chapter?.audioUrl ?? "", { headers: { cookie: h.cookie } });
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(CHAPTER);
  });

  it("has nothing to publish once the voice is deleted", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    await h.runtime.database.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
    expect(await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV })).toEqual({ kind: "not_running" });
  });
});
