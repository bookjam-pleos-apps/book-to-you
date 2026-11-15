import { renderSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createRenderQueueRepo } from "../../adapters/db/repos/render-queue-repo";
import { createRenderWorkerRepo } from "../../adapters/db/repos/render-worker-repo";
import { renders, voiceClips, voiceProfiles } from "../../adapters/db/schema";
import { POLICY } from "../../config";
import { createBatchHarness, GOOD_REPORT, SCRIPTS, STORY, STORY_WAV } from "../../testing/batch-render-harness";
import { createFakeRenderEngine } from "../../testing/fake-render-engine";
import { postJson } from "../../testing/test-runtime";
import { EMPTY_WORKER_MEMORY, tickRenderWorker, type WorkerMemory } from "./render-worker";

const WORKER_POLICY = { timeoutMs: 30 * 60_000, maxSubmissions: 2, cleanupGraceMs: 3 * 60_000 };
const OUTPUT = { report: GOOD_REPORT, storyWav: STORY_WAV };

describe("render worker", () => {
  let h: Awaited<ReturnType<typeof createBatchHarness>>;
  let fake: ReturnType<typeof createFakeRenderEngine>;
  let tick: ReturnType<typeof tickRenderWorker>;
  let memory: WorkerMemory;
  let t0: number;

  beforeEach(async () => {
    h = await createBatchHarness();
    fake = createFakeRenderEngine();
    const deps = {
      worker: createRenderWorkerRepo(h.runtime.database), renders: h.repo, engine: fake.engine, stories: h.publishDeps.stories,
      scripts: SCRIPTS, storage: h.runtime.storage, policy: POLICY.batchRender, workerPolicy: WORKER_POLICY, publish: h.publish, log: () => {},
    };
    tick = tickRenderWorker(deps);
    memory = EMPTY_WORKER_MEMORY;
    t0 = h.runtime.clock().getTime();
  });

  const tickAt = async (minutes: number) => {
    memory = await tick(memory, new Date(t0 + minutes * 60_000));
  };

  const requested = async () => {
    const { voiceId } = await h.readyVoice();
    const response = await postJson(h.runtime, "/v1/renders", { storyId: STORY.id, voiceId }, { cookie: h.cookie });
    const { renderId } = renderSchema.parse(await response.json());
    return { voiceId, renderId };
  };

  it("takes a requested story to playable and then clears the device folder, without any command", async () => {
    const { renderId } = await requested();
    await tickAt(0);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "running", engineTaskId: "T1", attempts: 1 });
    await tickAt(1);
    fake.finish("T1", OUTPUT);
    await tickAt(5);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "succeeded", chaptersDone: 1 });
    expect((await h.manifest()).stories.map((story) => story.renderId)).toEqual([renderId]);
    await tickAt(6);
    expect(fake.state.folders.has(renderId)).toBe(false);
    await tickAt(60);
    expect(await h.renderRow(renderId)).toMatchObject({ engineTaskId: null, engineSubmittedAt: null });
  });

  it("refuses an operator resume of a render the worker holds", async () => {
    const { voiceId, renderId } = await requested();
    await tickAt(0);
    expect(await h.start({ voiceId, storyId: STORY.id, resume: true })).toEqual({ kind: "already_running", renderId });
  });

  it("stops a render after the time limit and cancels its task", async () => {
    const { renderId } = await requested();
    await tickAt(0);
    await tickAt(31);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "failed", errorCode: "render_timeout" });
    expect(fake.state.cancelled).toContain("T1");
  });

  it("keeps waiting while the device is unreachable instead of submitting again", async () => {
    const { renderId } = await requested();
    await tickAt(0);
    fake.state.unreachable = true;
    await tickAt(5);
    await tickAt(10);
    expect([fake.state.submitted.length, (await h.renderRow(renderId))?.status]).toEqual([1, "running"]);
  });

  it("publishes a lost task whose result is still in the folder", async () => {
    const { renderId } = await requested();
    await tickAt(0);
    fake.state.tasks.delete("T1");
    fake.state.results.set(renderId, OUTPUT);
    await tickAt(5);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "succeeded" });
  });

  it("resubmits a lost task once and then gives up", async () => {
    const { renderId } = await requested();
    await tickAt(0);
    fake.state.tasks.delete("T1");
    await tickAt(5);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "running", engineTaskId: "T2", attempts: 2 });
    fake.state.tasks.delete("T2");
    await tickAt(10);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "failed", errorCode: "render_lost" });
  });

  it("fails a render whose task failed and still removes its folder", async () => {
    const { renderId } = await requested();
    await tickAt(0);
    fake.state.tasks.set("T1", "failed");
    await tickAt(2);
    await tickAt(3);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "failed", errorCode: "render_failed" });
    expect(fake.state.folders.has(renderId)).toBe(false);
  });

  it("moves the seed of a story asked again after a failed render", async () => {
    const { voiceId, renderId } = await requested();
    await tickAt(0);
    fake.state.tasks.set("T1", "failed");
    await tickAt(2);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "failed" });
    await postJson(h.runtime, "/v1/renders", { storyId: STORY.id, voiceId }, { cookie: h.cookie });
    await tickAt(4);
    expect(fake.state.submitted.map((job) => job.seed)).toEqual([POLICY.batchRender.seed, POLICY.batchRender.seed + 1]);
  });

  it("does not move the seed for a failure of another voice", async () => {
    await requested();
    await tickAt(0);
    fake.state.tasks.set("T1", "failed");
    await tickAt(2);
    await requested();
    await tickAt(4);
    expect(fake.state.submitted.map((job) => job.seed)).toEqual([POLICY.batchRender.seed, POLICY.batchRender.seed]);
  });

  it.each(["superseded", "abandoned", "no_active_consent"] as const)("does not move the seed for a %s failure that never rendered", async (errorCode) => {
    const { voiceId, renderId } = await requested();
    await tickAt(0);
    await h.runtime.database.update(renders).set({ status: "failed", errorCode, finishedAt: new Date(t0) }).where(eq(renders.id, renderId));
    await tickAt(1);
    await postJson(h.runtime, "/v1/renders", { storyId: STORY.id, voiceId }, { cookie: h.cookie });
    await tickAt(2);
    expect(fake.state.submitted.map((job) => job.seed)).toEqual([POLICY.batchRender.seed, POLICY.batchRender.seed]);
  });

  it("moves the seed after a render whose sentence QC failed", async () => {
    const { voiceId, renderId } = await requested();
    await tickAt(0);
    fake.finish("T1", { ...OUTPUT, report: [{ text: GOOD_REPORT[0]?.text ?? "", passed: false }] });
    await tickAt(1);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "failed", errorCode: "sentence_qc_failed" });
    await postJson(h.runtime, "/v1/renders", { storyId: STORY.id, voiceId }, { cookie: h.cookie });
    await tickAt(2);
    expect(fake.state.submitted.map((job) => job.seed)).toEqual([POLICY.batchRender.seed, POLICY.batchRender.seed + 1]);
  });

  it("cancels and cleans up when the voice is deleted mid-render", async () => {
    const { voiceId, renderId } = await requested();
    await tickAt(0);
    await h.runtime.database.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
    await tickAt(1);
    expect(fake.state.cancelled).toEqual(["T1"]);
    expect(fake.state.folders.has(renderId)).toBe(false);
  });

  it("cancels a task at once when its render ended while it was being submitted", async () => {
    const { renderId } = await requested();
    fake.state.afterSubmit = async () => {
      await createRenderQueueRepo(h.runtime.database).abandon(renderId, h.runtime.clock());
    };
    await tickAt(0);
    expect(fake.state.cancelled).toEqual(["T1"]);
    expect(await h.renderRow(renderId)).toMatchObject({ status: "failed", errorCode: "abandoned" });
  });

  it("fails a request whose recordings are gone without submitting", async () => {
    const { voiceId, renderId } = await requested();
    await h.runtime.database.delete(voiceClips).where(eq(voiceClips.voiceProfileId, voiceId));
    await tickAt(0);
    expect([fake.state.submitted.length, (await h.renderRow(renderId))?.errorCode]).toEqual([0, "no_passed_clip"]);
  });
});
