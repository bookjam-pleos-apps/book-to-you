import { renderDetailSchema, renderSchema } from "@voice-storybook/shared/contracts/v1";
import { beforeEach, describe, expect, it } from "vitest";

import { CHAPTER, createBatchHarness, GOOD_REPORT, STORY, STORY_WAV } from "../../testing/batch-render-harness";
import { loginAs, postJson } from "../../testing/test-runtime";

describe("render detail for the parent web", () => {
  let h: Awaited<ReturnType<typeof createBatchHarness>>;

  beforeEach(async () => {
    h = await createBatchHarness();
  });

  const get = (path: string, cookie: string = h.cookie) => h.runtime.app.request(path, { headers: { cookie } });

  const published = async () => {
    const { voiceId } = await h.readyVoice();
    const { job } = await h.startedJob(voiceId);
    await h.publish({ renderId: job.renderId, report: GOOD_REPORT, storyWav: STORY_WAV });
    return job.renderId;
  };

  it("gives a playable render's chapters, and the parent's session can play the audio", async () => {
    const renderId = await published();
    const detail = renderDetailSchema.parse(await (await get(`/v1/renders/${renderId}`)).json());
    expect(detail).toMatchObject({ renderId, storyId: STORY.id, status: "playable", voiceLabel: "엄마" });
    expect(detail.chapters).toEqual([{ index: 0, role: "body", title: null, durationMs: 1234, audioUrl: expect.stringMatching(/^\/v1\/audio\//) }]);
    const audio = await get(detail.chapters[0]?.audioUrl ?? "");
    expect(audio.status).toBe(200);
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(CHAPTER);
  });

  it("gives no chapters while the story is being made", async () => {
    const { voiceId } = await h.readyVoice();
    const queued = renderSchema.parse(await (await postJson(h.runtime, "/v1/renders", { storyId: STORY.id, voiceId }, { cookie: h.cookie })).json());
    const detail = renderDetailSchema.parse(await (await get(`/v1/renders/${queued.renderId}`)).json());
    expect([detail.status, detail.chapters]).toEqual(["making", []]);
  });

  it("answers 404 for another parent's render and for a malformed id", async () => {
    const renderId = await published();
    const stranger = await loginAs(h.runtime, "stranger@example.com");
    expect((await get(`/v1/renders/${renderId}`, stranger)).status).toBe(404);
    expect((await get("/v1/renders/not-a-uuid")).status).toBe(404);
  });
});
