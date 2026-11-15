import { join } from "node:path";

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Hono } from "hono";

import { connectDatabase, type Database } from "./adapters/db/client";
import { createApp } from "./adapters/http/app";
import type { AppEnv } from "./adapters/http/principal";
import { loadStoryCatalog } from "./adapters/content/story-catalog";
import { loadRecordingScripts } from "./adapters/content/recording-scripts";
import { createComposeClipAnalyzer, unavailableClipAnalyzer } from "./adapters/model-compose/compose-clip-analyzer";
import { createComposeTranscriber, unavailableTranscriber } from "./adapters/model-compose/compose-transcriber";
import { createFfmpegAudioTool, sweepAbandonedUploads } from "./adapters/ffmpeg/ffmpeg-audio-tool";
import { createFfmpegChapterEncoder } from "./adapters/ffmpeg/ffmpeg-chapter-encoder";
import { createFfmpegSilenceFinder } from "./adapters/ffmpeg/ffmpeg-silence-finder";
import { createLogMailer } from "./adapters/mail/log-mailer";
import { startProducer } from "./adapters/queue/pg-boss-queue";
import { createS3Storage, ensureBucket, type S3StorageOptions } from "./adapters/storage/s3-storage";
import type { Mailer } from "./application/ports/mailer";
import type { ClipAnalyzer } from "./application/ports/clip-analyzer";
import type { Clock } from "./application/ports/clock";
import type { JobQueue } from "./application/ports/job-queue";
import type { Transcriber } from "./application/ports/transcriber";
import { EngineUnavailable, type EngineKeyPurger } from "./application/ports/engine-key-purger";
import { loadEnv, POLICY, type Env } from "./config";
import type { BatchInfrastructure } from "./wiring/batch";
import { wireDeviceLookup, wireDeviceRoutes } from "./wiring/devices";
import { wireIdentityRoutes, wireSessionLookup } from "./wiring/identity";
import { wireLibraryRoutes } from "./wiring/library";
import { wireReportRoutes } from "./wiring/reports";
import type { Infrastructure } from "./wiring/infrastructure";
import { wireRenderRoutes } from "./wiring/renders";
import { wireInlineVerifyQueue, wireVerify, type VerifyInfrastructure } from "./wiring/verify";
import { wireVoiceRoutes } from "./wiring/voices";

export type { Infrastructure };

export const composeApp = (env: Env, infrastructure: Infrastructure): Hono<AppEnv> =>
  createApp(
    {
      publicOrigin: env.PUBLIC_ORIGIN,
      authenticator: { session: wireSessionLookup(infrastructure), device: wireDeviceLookup(infrastructure) },
    },
    [wireIdentityRoutes(env, infrastructure), wireDeviceRoutes(env, infrastructure), wireLibraryRoutes(env, infrastructure), wireReportRoutes(env, infrastructure), wireRenderRoutes(env, infrastructure), wireVoiceRoutes(env, infrastructure)],
  );

// 실제 엔진을 연결하기 전에 production에서 GPU 키를 지운 것처럼 처리하면 키가 조용히 사라진다. 행을 남겨 재시도하게 한다.
export const selectPurgeEngine = (env: Env): EngineKeyPurger =>
  env.NODE_ENV === "production"
    ? { purge: () => Promise.reject(new EngineUnavailable("GPU 엔진이 아직 연결되지 않았다")) }
    : { purge: () => Promise.resolve() };

// null이면 로그인이 꺼진다. 로그 메일러는 코드를 로그에 남기므로 production에서는 쓰지 않는다.
export const selectMailer = (env: Env): Mailer | null => {
  if (env.LOGIN_MODE === "disabled") return null;
  if (env.NODE_ENV === "production") throw new Error("실제 메일 어댑터가 아직 없어 production으로 기동할 수 없다");
  return createLogMailer(console.info);
};

const selectTranscriber = (env: Env): Transcriber =>
  env.COMPOSE_URL === undefined
    ? unavailableTranscriber
    : createComposeTranscriber({ url: env.COMPOSE_URL, timeoutMs: POLICY.verify.timeoutMs });

const selectClipAnalyzer = (env: Env): ClipAnalyzer =>
  env.COMPOSE_URL === undefined
    ? unavailableClipAnalyzer
    : createComposeClipAnalyzer({ url: env.COMPOSE_URL, timeoutMs: POLICY.verify.timeoutMs });

export const wireEnvVerify = (env: Env, infrastructure: EnvVerifyInfrastructure) =>
  wireVerify({ ...infrastructure, transcriber: selectTranscriber(env), analyzer: selectClipAnalyzer(env) });

export const loadScripts = (env: Env) => loadRecordingScripts(join(env.CONTENT_DIR, "scripts", "recording-scripts.json"));

export const loadStories = (env: Env) => loadStoryCatalog(join(env.CONTENT_DIR, "stories"));

export const storageOptions = (env: Env): S3StorageOptions => ({
  endpoint: env.S3_ENDPOINT,
  bucket: env.S3_BUCKET,
  accessKeyId: env.MINIO_ROOT_USER,
  secretAccessKey: env.MINIO_ROOT_PASSWORD,
});

export const openStorage = (env: Env) => createS3Storage(storageOptions(env));

export const systemClock: Clock = () => new Date();

type EnvVerifyInfrastructure = Omit<VerifyInfrastructure, "transcriber" | "analyzer">;

// 녹음 확인이 읽는 것. 진입점마다 같은 것을 만든다.
export const verifyInfrastructureOf = (env: Env, database: Database): EnvVerifyInfrastructure => ({
  database,
  storage: openStorage(env),
  scripts: loadScripts(env),
  clock: systemClock,
});

// 렌더를 시작하고 게시하는 데 필요한 것. 운영자 배치와 렌더 워커가 같은 것을 쓴다.
export const renderInfrastructureOf = (env: Env, database: Database): BatchInfrastructure => ({
  ...verifyInfrastructureOf(env, database),
  stories: loadStories(env),
  encoder: createFfmpegChapterEncoder({ timeoutMs: POLICY.batchRender.encodeTimeoutMs }),
  silences: createFfmpegSilenceFinder({ timeoutMs: POLICY.batchRender.encodeTimeoutMs }),
  aiNoticeVersion: env.AI_NOTICE_VERSION,
});

export type VerifiedQueue = { readonly queue: JobQueue; readonly stop: () => Promise<void> };

// 녹음 확인이 붙은 큐. 웹 업로드와 운영자 가져오기가 같은 확인(받아쓰기·check-clip)을 거치게 한 곳에서 만든다.
export const startVerifiedQueue = async (env: Env, deps: EnvVerifyInfrastructure): Promise<VerifiedQueue> => {
  const boss = await startProducer(env.DATABASE_URL);
  return { queue: wireInlineVerifyQueue(boss.queue, wireEnvVerify(env, deps)), stop: () => boss.stop() };
};

export type HttpRuntime = {
  readonly app: Hono<AppEnv>;
  readonly port: number;
  readonly stop: () => Promise<void>;
};

export const composeHttp = async (processEnv: NodeJS.ProcessEnv): Promise<HttpRuntime> => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  await connection.migrate();
  await ensureBucket(storageOptions(env));
  await sweepAbandonedUploads();
  const shared = verifyInfrastructureOf(env, connection.database);
  const verified = await startVerifiedQueue(env, shared);
  const app = composeApp(env, {
    ...shared,
    mailer: selectMailer(env),
    stories: loadStories(env),
    audio: createFfmpegAudioTool(POLICY.upload.ffmpeg),
    queue: verified.queue,
    remoteAddress: (c) => getConnInfo(c).remote.address ?? "unknown",
  });
  return { app, port: env.PORT, stop: () => verified.stop().then(connection.close) };
};
