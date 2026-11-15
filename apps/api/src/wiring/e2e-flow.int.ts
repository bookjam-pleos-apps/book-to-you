import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { manifestSchema, type Manifest } from "@voice-storybook/shared/contracts/v1";
import { afterAll, describe, expect, it } from "vitest";

import { loadRecordingScripts } from "../adapters/content/recording-scripts";
import { loadStoryCatalog } from "../adapters/content/story-catalog";
import { connectDatabase } from "../adapters/db/client";
import { createFfmpegChapterEncoder } from "../adapters/ffmpeg/ffmpeg-chapter-encoder";
import { createFfmpegSilenceFinder } from "../adapters/ffmpeg/ffmpeg-silence-finder";
import { createS3Storage, ensureBucket } from "../adapters/storage/s3-storage";
import { toneRecording } from "../testing/audio-fixtures";
import { CALM_MEASURE } from "../testing/fake-clip-analyzer";
import { createTestRuntime, deleteAs, loginAs, pairVehicle, type TestRuntime } from "../testing/test-runtime";
import { clipFields, consentFields, createVoiceFor, issuePhrase, postForm, validClip } from "../testing/voices";
import { wireBatchRender, withJobFolder } from "./batch";
import { wireRetention } from "./retention";
import { wireInlineVerifyQueue, wireVerify } from "./verify";

const CONTENT = resolve(import.meta.dirname, "../../../../content");
const storageOptions = {
  endpoint: process.env.S3_ENDPOINT ?? "",
  bucket: process.env.S3_BUCKET ?? "",
  accessKeyId: process.env.MINIO_ROOT_USER ?? "",
  secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "",
};

const connection = connectDatabase(process.env.DATABASE_URL ?? "");
const { database } = connection;
const storage = createS3Storage(storageOptions);
const clock = () => new Date();
const scripts = loadRecordingScripts(join(CONTENT, "scripts", "recording-scripts.json"));
const stories = loadStoryCatalog(join(CONTENT, "stories"));
const calmText = scripts.clips.find(({ style }) => style === "calm")?.text ?? "";
const spoken = { text: "" };
const transcriber = { transcribe: async () => spoken.text };
const queue = { enqueuePurge: async () => undefined, enqueueVerifyClip: async () => undefined, enqueueVerifyConsent: async () => undefined };
const analyzer = { analyze: async () => ({ transcript: spoken.text, measure: CALM_MEASURE }) };
const verify = wireVerify({ database, storage, transcriber, analyzer, scripts, clock });
const encoder = createFfmpegChapterEncoder({ timeoutMs: 60_000 });

afterAll(() => connection.close());

const recordConsentAndClip = async (runtime: TestRuntime, cookie: string, voiceId: string): Promise<void> => {
  const { phrase, phraseToken } = await issuePhrase(runtime, voiceId, cookie);
  spoken.text = phrase;
  const consent = await postForm(runtime, `/v1/voices/${voiceId}/consent`, cookie, consentFields(phraseToken), toneRecording({ seconds: 6 }));
  expect(consent.status).toBe(202);
  spoken.text = calmText;
  const clip = await postForm(runtime, `/v1/voices/${voiceId}/clips`, cookie, clipFields(), validClip());
  expect(clip.status).toBe(202);
};

const writeFakeRender = async (jobDirectory: string): Promise<void> => {
  const lines = stories.findStory("masteraway")?.lines ?? [];
  await mkdir(join(jobDirectory, "out"));
  await writeFile(join(jobDirectory, "out", "report.json"), JSON.stringify([{ text: lines.map(({ text }) => text).join(" "), passed: true }]));
  await writeFile(join(jobDirectory, "out", "story.wav"), toneRecording({ seconds: 2 }));
};

const renderThroughJobFolder = async (voiceId: string): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "e2e-flow-"));
  const jobDirectory = join(root, "job");
  const batch = withJobFolder(wireBatchRender({ database, storage, stories, scripts, encoder, silences: createFfmpegSilenceFinder({ timeoutMs: 60_000 }), clock, aiNoticeVersion: "2026-11" }));
  expect((await batch.start({ voiceId, storyId: "masteraway" }, jobDirectory)).kind).toBe("started");
  await writeFakeRender(jobDirectory);
  expect((await batch.publish(jobDirectory)).kind).toBe("published");
  await rm(root, { recursive: true, force: true });
};

const readManifest = async ({ app }: TestRuntime, headers: Record<string, string>): Promise<Manifest> =>
  manifestSchema.parse(await (await app.request("/v1/library/manifest", { headers })).json());

const expectVehicleCanPlay = async (runtime: TestRuntime, bearer: Record<string, string>): Promise<void> => {
  const [story] = (await readManifest(runtime, bearer)).stories;
  expect(story?.title).toBe("주인님이 집을 비운 사이");
  const chapter = story?.chapters[0];
  const audio = await runtime.app.request(chapter?.audioUrl ?? "", { headers: bearer });
  const bytes = new Uint8Array(await audio.arrayBuffer());
  expect(audio.headers.get("content-type")).toBe("audio/mp4");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(chapter?.sha256);
};

describe("upload to vehicle to deletion on real Postgres and MinIO", () => {
  it("goes through consent, clip, batch render, manifest, audio and leaves nothing behind", async () => {
    await ensureBucket(storageOptions);
    const runtime = await createTestRuntime({ database, storage, stories, scripts, clock, queue: wireInlineVerifyQueue(queue, verify) });
    const cookie = await loginAs(runtime, `${randomUUID()}@example.com`);
    const voiceId = await createVoiceFor(runtime, cookie);
    await recordConsentAndClip(runtime, cookie, voiceId);
    await renderThroughJobFolder(voiceId);
    await expectVehicleCanPlay(runtime, { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` });

    expect((await deleteAs(runtime, "/v1/me", cookie)).status).toBeLessThan(300);
    await wireRetention({ database, storage, engine: { purge: async () => {} }, queue, clock }).purge();
    expect((await storage.list("u/")).filter(({ key }) => key.includes(voiceId))).toEqual([]);
  });
});
