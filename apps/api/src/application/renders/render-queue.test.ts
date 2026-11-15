import { renderSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createRenderQueueRepo } from "../../adapters/db/repos/render-queue-repo";
import { consentRecords, renders, voiceProfiles } from "../../adapters/db/schema";
import { createBatchHarness, GOOD_REPORT, STORY, STORY_WAV } from "../../testing/batch-render-harness";
import { seedRender, seedVoiceWithConsent } from "../../testing/seed-library";
import { loginAs, postJson } from "../../testing/test-runtime";

describe("render request and operator claim", () => {
  let h: Awaited<ReturnType<typeof createBatchHarness>>;

  beforeEach(async () => {
    h = await createBatchHarness();
  });

  const request = (voiceId: string, storyId: string = STORY.id, cookie: string = h.cookie) =>
    postJson(h.runtime, "/v1/renders", { storyId, voiceId }, { cookie });

  const rowsOf = () => h.runtime.database.select().from(renders);

  it("queues a request without starting a render and answers 202 as making", async () => {
    const { voiceId } = await h.readyVoice();
    const response = await request(voiceId);
    expect(response.status).toBe(202);
    const render = renderSchema.parse(await response.json());
    expect(render).toMatchObject({ storyId: STORY.id, title: "토토의 소풍", voiceId, voiceLabel: "엄마", status: "making" });
    expect(await rowsOf()).toMatchObject([{ id: render.renderId, status: "queued", attempts: 0, chaptersDone: 0 }]);
  });

  it("returns the same render for a repeated request instead of queuing twice", async () => {
    const { voiceId } = await h.readyVoice();
    const first = renderSchema.parse(await (await request(voiceId)).json());
    const again = await request(voiceId);
    expect(again.status).toBe(200);
    expect(renderSchema.parse(await again.json()).renderId).toBe(first.renderId);
    expect(await rowsOf()).toHaveLength(1);
  });

  it("returns a finished render as playable without queuing again", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
    const response = await request(voiceId);
    expect(response.status).toBe(200);
    expect(renderSchema.parse(await response.json())).toMatchObject({ renderId: job.renderId, status: "playable" });
    expect(await rowsOf()).toHaveLength(1);
  });

  it.each([
    ["a voice id that is not a uuid", async () => request("not-a-uuid"), 404, "not_found"],
    ["an unknown story", async () => request((await h.readyVoice()).voiceId, "nope"), 404, "not_found"],
    ["a voice of another account", async () => request((await h.readyVoice()).voiceId, STORY.id, await loginAs(h.runtime, "other@example.com")), 404, "not_found"],
    ["a voice without a passed clip", async () => request((await seedVoiceWithConsent(h.runtime, h.userId)).voiceId), 409, "no_passed_clip"],
    ["a voice with two passed clips of one style", async () => {
      const { voiceId } = await h.readyVoice();
      await h.seedClip(voiceId);
      return request(voiceId);
    }, 409, "ambiguous_clip"],
    ["a voice without an active consent", async () => {
      const { voiceId } = await seedVoiceWithConsent(h.runtime, h.userId, "checking");
      await h.seedClip(voiceId);
      return request(voiceId);
    }, 403, "no_active_consent"],
  ])("rejects %s without leaving a row", async (_, send, status, code) => {
    const response = await send();
    expect([response.status, await response.json()]).toEqual([status, { error: code }]);
    expect(await rowsOf()).toHaveLength(0);
  });

  it("rejects a malformed body", async () => {
    const response = await postJson(h.runtime, "/v1/renders", { storyId: STORY.id }, { cookie: h.cookie });
    expect(response.status).toBe(400);
  });

  it("stops at three unfinished renders per account, but still returns an existing one", async () => {
    const voices = await Promise.all([h.readyVoice(), h.readyVoice(), h.readyVoice(), h.readyVoice()]);
    const statuses = await voices.reduce<Promise<readonly number[]>>(
      async (done, { voiceId }) => [...(await done), (await request(voiceId)).status],
      Promise.resolve([]),
    );
    expect(statuses).toEqual([202, 202, 202, 429]);
    expect((await request(voices[0]?.voiceId ?? "")).status).toBe(200);
  });

  it("refuses to queue after the consent is gone", async () => {
    const { voiceId } = await h.readyVoice();
    await h.runtime.database.update(voiceProfiles).set({ activeConsentId: null }).where(eq(voiceProfiles.id, voiceId));
    expect((await request(voiceId)).status).toBe(403);
  });

  it("is taken by the operator's start: the queued row becomes running", async () => {
    const { voiceId } = await h.readyVoice();
    const queued = renderSchema.parse(await (await request(voiceId)).json());
    const { job } = await h.startedJob(voiceId);
    expect(job.renderId).toBe(queued.renderId);
    expect(await rowsOf()).toMatchObject([{ id: queued.renderId, status: "running", attempts: 1 }]);
  });

  it("re-plans the queued row when the recordings changed after the request", async () => {
    const { voiceId, clipId } = await h.readyVoice();
    const queued = renderSchema.parse(await (await request(voiceId)).json());
    const excitedId = await h.seedClip(voiceId, { style: "excited" });
    const { job } = await h.startedJob(voiceId);
    expect(job.renderId).toBe(queued.renderId);
    expect(await rowsOf()).toMatchObject([{ status: "running", refClipIds: [clipId, excitedId] }]);
  });

  it("fails a stale queued row when the same render is already finished", async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
    const { renderId: stale } = await seedRender(h.runtime, { userId: h.userId, voiceId, status: "queued", startedAt: new Date() });
    expect(await h.start({ voiceId, storyId: STORY.id })).toEqual({ kind: "already_rendered", renderId: job.renderId });
    expect(await h.renderRow(stale)).toMatchObject({ status: "failed", errorCode: "superseded", finishedAt: expect.any(Date) });
  });

  it("lets the operator list unfinished renders and abandon a stuck one so the parent can ask again", async () => {
    const { voiceId } = await h.readyVoice();
    const queued = renderSchema.parse(await (await request(voiceId)).json());
    const queue = createRenderQueueRepo(h.runtime.database);
    expect(await queue.listPending()).toMatchObject([{ renderId: queued.renderId, voiceId, storyId: STORY.id, status: "queued" }]);
    expect(await queue.abandon(queued.renderId, new Date())).toBe(true);
    expect(await queue.abandon(queued.renderId, new Date())).toBe(false);
    expect(await queue.listPending()).toEqual([]);
    const again = await request(voiceId);
    expect([again.status, renderSchema.parse(await again.json()).renderId === queued.renderId]).toEqual([202, false]);
  });

  it("starts a fresh render when the operator abandoned the queued one first", async () => {
    const { voiceId } = await h.readyVoice();
    const queued = renderSchema.parse(await (await request(voiceId)).json());
    await createRenderQueueRepo(h.runtime.database).abandon(queued.renderId, new Date());
    const { job } = await h.startedJob(voiceId);
    expect(job.renderId).not.toBe(queued.renderId);
    expect((await h.renderRow(queued.renderId))?.status).toBe("failed");
  });

  it("deletes the queued row together with a deleted voice", async () => {
    const { voiceId } = await h.readyVoice();
    await request(voiceId);
    await h.runtime.database.delete(consentRecords).where(eq(consentRecords.voiceProfileId, voiceId));
    await h.runtime.database.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
    expect(await rowsOf()).toHaveLength(0);
  });
});
