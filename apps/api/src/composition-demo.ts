import { connectDatabase } from "./adapters/db/client";
import { createFfmpegAudioCutter } from "./adapters/ffmpeg/ffmpeg-audio-cutter";
import { createFfmpegAudioTool } from "./adapters/ffmpeg/ffmpeg-audio-tool";
import { createFfmpegSilenceFinder } from "./adapters/ffmpeg/ffmpeg-silence-finder";
import { ensureBucket } from "./adapters/storage/s3-storage";
import { loadScripts, loadStories, openStorage, startVerifiedQueue, storageOptions, systemClock } from "./composition";
import { loadEnv, POLICY, type Env } from "./config";
import { wireChapterize } from "./wiring/chapterize";
import { wireDemoClipImport, wireDemoRenderRequest, wireDemoTransfer } from "./wiring/demo";

// 시연 서버 운영자 진입점(entrypoints/commands/main-demo-*)의 조립이다.

// 데모 사용자는 로그인이 꺼진 시연 서버에서만 정한다. 개발 DB의 사용자를 잘못 고르거나 덮지 않게 한다.
const demoUserOf = (env: Env): string | undefined => (env.LOGIN_MODE === "disabled" ? env.DEMO_USER_ID : undefined);

export const composeDemoTransfer = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  await connection.migrate();
  await ensureBucket(storageOptions(env));
  const storage = openStorage(env);
  // 가져오기는 데모 사용자의 음성과 객체를 모두 바꾼다.
  return { ...wireDemoTransfer({ database: connection.database, storage }, demoUserOf(env)), stop: connection.close };
};

export const composeDemoClipImport = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  // 녹음 확인 서비스 없이 올리면 클립이 "확인 중"에 머문다. 시작하기 전에 막는다.
  if (env.COMPOSE_URL === undefined) throw new Error("COMPOSE_URL(voice-clone 서비스)이 있어야 녹음 확인까지 끝낼 수 있다");
  const connection = connectDatabase(env.DATABASE_URL);
  await ensureBucket(storageOptions(env));
  const storage = openStorage(env);
  const scripts = loadScripts(env);
  const verified = await startVerifiedQueue(env, { database: connection.database, storage, scripts, clock: systemClock });
  const run = wireDemoClipImport({
    database: connection.database,
    storage,
    scripts,
    audio: createFfmpegAudioTool(POLICY.upload.ffmpeg),
    queue: verified.queue,
  }, demoUserOf(env));
  return { run, stop: () => verified.stop().then(connection.close) };
};

// 렌더는 렌더 워커(gpu 프로필)가 대기열에서 꺼내 처리한다. 이 명령은 요청만 넣는다.
export const composeDemoRenderRequest = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  const run = wireDemoRenderRequest({
    database: connection.database,
    stories: loadStories(env),
    scripts: loadScripts(env),
    clock: systemClock,
  }, demoUserOf(env));
  return { run, stop: connection.close };
};

// 장 계획이 생긴 이야기의, 장 하나로 올린 렌더를 다시 렌더하지 않고 장으로 나눈다. 모든 사용자의 렌더가 대상이다.
export const composeChapterize = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  await connection.migrate();
  const ffmpeg = { timeoutMs: POLICY.batchRender.encodeTimeoutMs };
  const run = wireChapterize({
    database: connection.database,
    storage: openStorage(env),
    stories: loadStories(env),
    silences: createFfmpegSilenceFinder(ffmpeg),
    cutter: createFfmpegAudioCutter(ffmpeg),
  });
  return { run, stop: connection.close };
};
