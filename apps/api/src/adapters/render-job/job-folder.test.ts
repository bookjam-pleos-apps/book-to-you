import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RenderJob } from "../../application/renders/ports";
import jobExample from "./fixtures/job.example.json";
import { readRenderOutput, removeRenderJob, RENDER_JOB_FORMAT, writeRenderJob } from "./job-folder";

const JOB: RenderJob = {
  renderId: "r1",
  storyId: "s1",
  model: "model",
  seed: 1,
  limits: { maxSyllables: 180, minSyllables: 30 },
  references: [
    { style: "calm", text: "대본" },
    { style: "excited", text: "신난 대본" },
    { style: "soft", text: "부드러운 대본" },
  ],
  readAs: { calm: "calm", excited: "excited", soft: "soft" },
  lines: [{ text: "문장", style: "soft", pauseAfterMs: 450 }],
};
const WAVS = new Map([
  ["calm", new Uint8Array([1])],
  ["excited", new Uint8Array([2])],
  ["soft", new Uint8Array([3])],
] as const);
const keysOf = (value: object | undefined) => Object.keys(value ?? {}).toSorted();
const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("render job folder", () => {
  let root: string;
  let job: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "render-job-test-"));
    job = join(root, "job");
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("keeps the parent voice private and refuses to reuse a folder", async () => {
    await writeRenderJob(job, JOB, WAVS);
    expect([...(await readFile(join(job, "reference-excited.wav")))]).toEqual([2]);
    expect((await stat(join(job, "reference-calm.wav"))).mode & 0o077).toBe(0);
    expect((await stat(job)).mode & 0o077).toBe(0);
    await expect(writeRenderJob(job, { ...JOB, renderId: "r2" }, WAVS)).rejects.toThrow("이미 있는");
  });

  it("writes the job in the shape the GPU side reads", async () => {
    await writeRenderJob(job, JOB, WAVS);
    const written = JSON.parse(await readFile(join(job, "job.json"), "utf8"));
    expect(written.format).toBe(RENDER_JOB_FORMAT);
    expect(keysOf(written)).toEqual(keysOf(jobExample));
    expect(keysOf(written.references[0])).toEqual(keysOf(jobExample.references[0]));
    expect(keysOf(written.lines[0])).toEqual(keysOf(jobExample.lines[0]));
    expect(written.references.map(({ file }: { file: string }) => file)).toEqual(["reference-calm.wav", "reference-excited.wav", "reference-soft.wav"]);
  });

  it("refuses a job whose reference recording is missing, writing nothing", async () => {
    await expect(writeRenderJob(job, JOB, new Map([["calm", new Uint8Array([1])]]))).rejects.toThrow("참조 녹음이 빠진");
    expect(existsSync(job)).toBe(false);
  });

  it("reads the render back with its id", async () => {
    await writeRenderJob(job, JOB, WAVS);
    await mkdir(join(job, "out"));
    await writeFile(join(job, "out", "report.json"), JSON.stringify([{ text: "문장", passed: true, cer: 0 }]));
    await writeFile(join(job, "out", "story.wav"), new Uint8Array([9]));
    const output = await readRenderOutput(job);
    expect(output).toMatchObject({ renderId: "r1", report: [{ text: "문장", passed: true }] });
    expect([...output.storyWav]).toEqual([9]);
  });

  it("reads the report in the shape the GPU side writes", async () => {
    await writeRenderJob(job, JOB, WAVS);
    await mkdir(join(job, "out"));
    await copyFile(join(FIXTURES, "report.example.json"), join(job, "out", "report.json"));
    await writeFile(join(job, "out", "story.wav"), new Uint8Array([9]));
    expect((await readRenderOutput(job)).report).toEqual([{ text: "주인님이 집을 비운 사이", passed: true }]);
  });

  it("removes only a job folder", async () => {
    await writeRenderJob(job, JOB, WAVS);
    await removeRenderJob(job);
    expect(existsSync(job)).toBe(false);
    await expect(removeRenderJob(root)).rejects.toThrow("작업 폴더가 아니어서");
    expect(existsSync(root)).toBe(true);
  });
});
