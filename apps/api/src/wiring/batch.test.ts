import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RenderJob } from "../application/renders/ports";
import { withJobFolder } from "./batch";

const JOB: RenderJob = {
  renderId: "r1",
  storyId: "s1",
  model: "m",
  seed: 1,
  limits: { maxSyllables: 180, minSyllables: 30 },
  references: [{ style: "calm", text: "대본" }],
  readAs: {},
  lines: [],
};

describe("job folder lifecycle", () => {
  let root: string;
  let job: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "batch-wiring-test-"));
    job = join(root, "job");
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  const startFolder = async (publish: Parameters<typeof withJobFolder>[0]["publish"]) => {
    const batch = withJobFolder({ start: async () => ({ kind: "started", job: JOB, referenceWavs: new Map([["calm", new Uint8Array([1])]]) }), publish });
    await batch.start({ voiceId: "v", storyId: "s1" }, job);
    await mkdir(join(job, "out"));
    await writeFile(join(job, "out", "report.json"), "[]");
    await writeFile(join(job, "out", "story.wav"), new Uint8Array([2]));
    return batch;
  };

  it.each(["not_running", "sentence_qc_failed", "script_mismatch", "story_changed", "no_active_consent"] as const)(
    "removes the parent voice when publishing ends in %s",
    async (kind) => {
      const batch = await startFolder(async () => ({ kind }));
      expect(await batch.publish(job)).toEqual({ kind });
      expect(existsSync(job)).toBe(false);
    },
  );

  it("removes it after a successful publish", async () => {
    const batch = await startFolder(async () => ({ kind: "published", chapterKeys: ["k"], durationMs: 1, chapterProblem: null }));
    await batch.publish(job);
    expect(existsSync(job)).toBe(false);
  });

  it("keeps it when publishing throws, so the same folder can be retried", async () => {
    const batch = await startFolder(() => Promise.reject(new Error("storage down")));
    await expect(batch.publish(job)).rejects.toThrow("storage down");
    expect(existsSync(join(job, "reference-calm.wav"))).toBe(true);
  });

  it("writes no folder when the start is refused", async () => {
    const batch = withJobFolder({ start: async () => ({ kind: "no_active_consent" }), publish: () => Promise.reject(new Error("unused")) });
    expect(await batch.start({ voiceId: "v", storyId: "s1" }, job)).toEqual({ kind: "no_active_consent" });
    expect(existsSync(job)).toBe(false);
  });
});
