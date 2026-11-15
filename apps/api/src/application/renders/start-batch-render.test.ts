import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { renders } from "../../adapters/db/schema";
import { createBatchHarness, GOOD_REPORT, referenceOf, SCRIPTS, STORY, STORY_WAV } from "../../testing/batch-render-harness";
import { seedVoiceWithConsent } from "../../testing/seed-library";

const scriptText = (id: string) => SCRIPTS.clips.find((clip) => clip.id === id)?.text ?? "";

describe("batch render start", () => {
  let h: Awaited<ReturnType<typeof createBatchHarness>>;

  beforeEach(async () => {
    h = await createBatchHarness();
  });

  it("hands each style's passed clip, its script and the full story to the job", async () => {
    const { voiceId, clipId } = await h.readyVoice();
    const excitedId = await h.seedClip(voiceId, { style: "excited" });
    const { job, referenceWavs } = await h.startedJob(voiceId);
    expect(job).toMatchObject({ storyId: STORY.id, lines: STORY.lines, seed: 1234, readAs: { calm: "calm", excited: "excited" } });
    expect(job.references).toEqual([{ style: "calm", text: scriptText("calm") }, { style: "excited", text: scriptText("excited") }]);
    expect([...referenceWavs]).toEqual([["calm", referenceOf("calm")], ["excited", referenceOf("excited")]]);
    expect(await h.renderRow(job.renderId)).toMatchObject({ status: "running", refClipIds: [clipId, excitedId], chaptersTotal: 1, userId: h.userId, voiceProfileId: voiceId });
  });

  it("moves the seed of an operator re-render after a rendered failure", async () => {
    const { voiceId } = await h.readyVoice();
    const first = await h.startedJob(voiceId);
    await h.publish({ renderId: first.job.renderId, report: [{ text: GOOD_REPORT[0]?.text ?? "", passed: false }], storyWav: STORY_WAV });
    expect(await h.renderRow(first.job.renderId)).toMatchObject({ status: "failed", errorCode: "sentence_qc_failed" });
    const { job } = await h.startedJob(voiceId);
    expect([first.job.seed, job.seed]).toEqual([1234, 1235]);
  });

  it("keeps the calm path: a voice with only calm reads every line as calm", async () => {
    const { voiceId, clipId } = await h.readyVoice();
    const { job, referenceWavs } = await h.startedJob(voiceId);
    expect(job).toMatchObject({ references: [{ style: "calm" }], readAs: { calm: "calm", excited: "calm" } });
    expect([...referenceWavs.keys()]).toEqual(["calm"]);
    expect(await h.renderRow(job.renderId)).toMatchObject({ refClipIds: [clipId] });
  });

  it("reads every line as calm when the operator keeps to calm, even with other recordings", async () => {
    const { voiceId, clipId } = await h.readyVoice();
    await h.seedClip(voiceId, { style: "excited" });
    const started = await h.start({ voiceId, storyId: STORY.id, onlyStyles: ["calm"] });
    expect(started).toMatchObject({ kind: "started", job: { references: [{ style: "calm" }], readAs: { calm: "calm", excited: "calm" } } });
    if (started.kind === "started") expect(await h.renderRow(started.job.renderId)).toMatchObject({ refClipIds: [clipId] });
  });

  it("reads soft lines with the soft recording", async () => {
    h.state.story = { ...STORY, lines: [...STORY.lines, { text: "조용히 말했어요.", style: "soft", pauseAfterMs: 450 }] };
    const { voiceId } = await h.readyVoice();
    await h.seedClip(voiceId, { style: "excited" });
    await h.seedClip(voiceId, { style: "soft" });
    const { job, referenceWavs } = await h.startedJob(voiceId);
    expect(job.readAs).toEqual({ calm: "calm", excited: "excited", soft: "soft" });
    expect(job.references.map((reference) => reference.style)).toEqual(["calm", "excited", "soft"]);
    expect([...referenceWavs]).toEqual([["calm", referenceOf("calm")], ["excited", referenceOf("excited")], ["soft", referenceOf("soft")]]);
  });

  it("reads a style listed in the policy with another recording, even when it is recorded", async () => {
    const redirected = await createBatchHarness({ readAs: { soft: "calm" } });
    redirected.state.story = { ...STORY, lines: [...STORY.lines, { text: "조용히 말했어요.", style: "soft", pauseAfterMs: 450 }] };
    const { voiceId } = await redirected.readyVoice();
    await redirected.seedClip(voiceId, { style: "soft" });
    const { job, referenceWavs } = await redirected.startedJob(voiceId);
    expect(job.readAs).toEqual({ calm: "calm", excited: "calm", soft: "calm" });
    expect([...referenceWavs.keys()]).toEqual(["calm"]);
  });

  it("refuses without an active consent", async () => {
    const { voiceId } = await seedVoiceWithConsent(h.runtime, h.userId, "checking");
    await h.seedClip(voiceId);
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "no_active_consent" });
    expect(await h.runtime.database.select().from(renders)).toHaveLength(0);
  });

  it("uses only passed clips and needs calm to fall back on", async () => {
    const { voiceId } = await seedVoiceWithConsent(h.runtime, h.userId);
    await h.seedClip(voiceId, { status: "checking" });
    await h.seedClip(voiceId, { status: "failed" });
    await h.seedClip(voiceId, { style: "excited" });
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "no_passed_clip" });
  });

  it("asks which clip when a style has several passed and takes the chosen one", async () => {
    const { voiceId, clipId } = await h.readyVoice();
    await h.seedClip(voiceId);
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "ambiguous_clip", style: "calm" });
    const chosen = await h.start({ voiceId, storyId: STORY.id, clipIds: [clipId] });
    expect(chosen.kind).toBe("started");
  });

  it("refuses an unknown story, voice or script", async () => {
    const { voiceId } = await seedVoiceWithConsent(h.runtime, h.userId);
    await h.seedClip(voiceId, { scriptId: "retired" });
    expect(await h.start({ voiceId, storyId: "nope" })).toEqual({ kind: "unknown_story" });
    expect(await h.start({ voiceId: randomUUID(), storyId: STORY.id })).toEqual({ kind: "voice_not_found" });
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "unknown_script" });
  });

  it("refuses a story with a line the renderer cannot read, before opening a render", async () => {
    const { voiceId } = await h.readyVoice();
    const tooLong = { text: "가".repeat(181), style: "calm", pauseAfterMs: 450 } as const;
    h.state.story = { ...STORY, lines: [...STORY.lines, tooLong] };
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "unrenderable_line", index: STORY.lines.length });
    expect(await h.runtime.database.select().from(renders)).toHaveLength(0);
  });

  it("refuses a second run while one is going, until the operator resumes it", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "already_running", renderId: job.renderId });
    const resumed = await h.start({ voiceId, storyId: STORY.id, resume: true });
    expect(resumed).toMatchObject({ kind: "started", job: { renderId: job.renderId } });
    expect(await h.renderRow(job.renderId)).toMatchObject({ attempts: 2 });
  });

  it("refuses to redo a finished render, even with resume", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
    expect(await h.start({ voiceId, storyId: STORY.id, resume: true })).toEqual({ kind: "already_rendered", renderId: job.renderId });
  });
});
