import {
  deviceListResponseSchema,
  pairStartResponseSchema,
  pairTokenResponseSchema,
} from "@voice-storybook/shared/contracts/v1";

import { resolve } from "node:path";

import type { JobQueue } from "../application/ports/job-queue";
import type { Mailer } from "../application/ports/mailer";
import type { StoryCatalog, StoryContent, StoryContents } from "../application/stories";
import { loadRecordingScripts } from "../adapters/content/recording-scripts";
import { createFfmpegAudioTool } from "../adapters/ffmpeg/ffmpeg-audio-tool";
import { openTestDatabase } from "../adapters/db/testing/open-test-database";
import { createInMemoryStorage } from "../adapters/storage/in-memory-storage";
import { composeApp, type Infrastructure } from "../composition";
import { loadEnv, POLICY } from "../config";

export const TEST_ORIGIN = "https://storybook.example";
export const TEST_TERMS = { termsVersion: "2026-11", aiNoticeVersion: "2026-11" };
// 시연 서버 설정. 시험 시계(2026-11-04)보다 하루 뒤에 끝난다.
export const TEST_DEMO_ENV = {
  DEMO_PAIRING_CODE: "demo-7Kq2-Xv9p-Lm4r",
  DEMO_USER_ID: "00000000-0000-4000-8000-0000000000d1",
  DEMO_PAIRING_UNTIL: "2026-11-05T00:00:00Z",
};

const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "unused",
  PUBLIC_ORIGIN: TEST_ORIGIN,
  AUTH_SECRET: "test-secret-test-secret-test-secret",
  S3_ENDPOINT: "http://unused.example",
  S3_BUCKET: "unused",
  MINIO_ROOT_USER: "unused",
  MINIO_ROOT_PASSWORD: "unused",
};

const createRecordingMailer = () => {
  const sent: { email: string; code: string }[] = [];
  const mailer: Mailer = {
    sendOtp: async (email, code) => {
      sent.push({ email, code });
    },
  };
  return { mailer, sent, lastCode: () => sent.at(-1)?.code ?? "" };
};

const createRecordingQueue = () => {
  const jobs: { kind: string; id?: string }[] = [];
  const queue: JobQueue = {
    enqueueVerifyClip: async (id) => void jobs.push({ kind: "verify-clip", id }),
    enqueueVerifyConsent: async (id) => void jobs.push({ kind: "verify-consent", id }),
    enqueuePurge: async () => void jobs.push({ kind: "purge" }),
  };
  return { queue, jobs };
};

export const TEST_STORY: StoryContent = {
  id: "toto-picnic",
  title: "토토의 소풍",
  version: "v1",
  lines: [
    { text: "첫 문장.", style: "calm", pauseAfterMs: 450 },
    { text: "신나는 문장!", style: "excited", pauseAfterMs: 900 },
  ],
  chapters: [],
};

const TEST_CATALOG: StoryCatalog & StoryContents = {
  findTitle: (storyId) => (storyId === TEST_STORY.id ? TEST_STORY.title : null),
  list: () => [{ id: TEST_STORY.id, title: TEST_STORY.title }],
  findStory: (storyId) => (storyId === TEST_STORY.id ? TEST_STORY : null),
};

const SCRIPTS = resolve(import.meta.dirname, "../../../../content/scripts/recording-scripts.json");

export const createTestRuntime = async (overrides: Partial<Infrastructure> = {}, envOverrides: Record<string, string> = {}) => {
  const database = await openTestDatabase();
  const mail = createRecordingMailer();
  const time = { nowMs: Date.parse("2026-11-04T00:00:00Z") };
  const jobs = createRecordingQueue();
  const storage = createInMemoryStorage(() => new Date(time.nowMs));
  const clock = () => new Date(time.nowMs);
  const app = composeApp(loadEnv({ ...TEST_ENV, ...envOverrides }), {
    database,
    mailer: mail.mailer,
    storage,
    stories: TEST_CATALOG,
    scripts: loadRecordingScripts(SCRIPTS),
    audio: createFfmpegAudioTool(POLICY.upload.ffmpeg),
    queue: jobs.queue,
    clock,
    remoteAddress: () => "10.0.0.1",
    ...overrides,
  });
  const advance = (ms: number): void => {
    time.nowMs += ms;
  };
  return { app, database, mail, storage, clock, queue: jobs.queue, jobs: jobs.jobs, advance };
};

export type TestRuntime = Awaited<ReturnType<typeof createTestRuntime>>;

const JSON_HEADERS = { "content-type": "application/json", origin: TEST_ORIGIN };

export const postJson = (runtime: TestRuntime, path: string, body: unknown, headers: Record<string, string> = {}) =>
  runtime.app.request(path, { method: "POST", headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) });

export const sessionCookieOf = (response: Response): string =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

export const loginAs = async (runtime: TestRuntime, email: string): Promise<string> => {
  await postJson(runtime, "/v1/auth/otp/request", { email });
  const response = await postJson(runtime, "/v1/auth/otp/verify", { email, code: runtime.mail.lastCode(), ...TEST_TERMS });
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`);
  return sessionCookieOf(response);
};

export const inSequence = (times: number, step: (index: number) => unknown): Promise<unknown> =>
  Array.from({ length: times }).reduce<Promise<unknown>>(
    (previous, _, index) => previous.then(() => step(index)),
    Promise.resolve(),
  );

export const pairVehicle = async (runtime: TestRuntime, cookie: string, deviceName = "내 차"): Promise<string> => {
  const started = pairStartResponseSchema.parse(
    await (await postJson(runtime, "/v1/devices/pair/start", { deviceName })).json(),
  );
  await postJson(runtime, "/v1/devices/pair/confirm", { userCode: started.userCode }, { cookie });
  const issued = await postJson(runtime, "/v1/devices/pair/token", { deviceCode: started.deviceCode });
  return pairTokenResponseSchema.parse(await issued.json()).accessToken;
};

export const deleteAs = (runtime: TestRuntime, path: string, cookie: string) =>
  runtime.app.request(path, { method: "DELETE", headers: { cookie, origin: TEST_ORIGIN } });

export const listDevicesOf = async (runtime: TestRuntime, cookie: string) => {
  const response = await runtime.app.request("/v1/devices", { headers: { cookie } });
  return deviceListResponseSchema.parse(await response.json()).devices;
};
