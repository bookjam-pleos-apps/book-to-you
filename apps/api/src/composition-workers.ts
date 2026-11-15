import { connectDatabase } from "./adapters/db/client";
import { acquireSingleInstanceLock } from "./adapters/db/single-instance-lock";
import { startWorker } from "./adapters/queue/pg-boss-queue";
import { ensureBucket } from "./adapters/storage/s3-storage";
import { renderInfrastructureOf, selectPurgeEngine, storageOptions, verifyInfrastructureOf, wireEnvVerify } from "./composition";
import { loadEnv } from "./config";
import { wireBatchRender, withJobFolder } from "./wiring/batch";
import { RENDER_WORKER_LOCK_KEY, startRenderWorker, wireRenderWorker } from "./wiring/render-worker";
import { wireRetention } from "./wiring/retention";
import { wireInlineVerifyQueue, wireVerifyPending } from "./wiring/verify";

// HTTP 밖에서 도는 진입점(main-worker, main-verify-pending, main-render-batch, main-render-worker)의 조립이다.
export const composeWorker = async (processEnv: NodeJS.ProcessEnv): Promise<{ readonly stop: () => Promise<void> }> => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  await ensureBucket(storageOptions(env));
  const shared = verifyInfrastructureOf(env, connection.database);
  const verify = wireEnvVerify(env, shared);
  const worker = await startWorker(env.DATABASE_URL, (queue) =>
    wireRetention({ ...shared, engine: selectPurgeEngine(env), queue: wireInlineVerifyQueue(queue, verify) }),
  );
  return { stop: () => worker.stop().then(connection.close) };
};

export const composeVerifyPending = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  const verify = wireEnvVerify(env, verifyInfrastructureOf(env, connection.database));
  return wireVerifyPending(connection.database, verify)().finally(connection.close);
};

export const composeRenderBatch = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  const connection = connectDatabase(env.DATABASE_URL);
  const batch = wireBatchRender(renderInfrastructureOf(env, connection.database));
  return { ...withJobFolder(batch), stop: connection.close };
};

// 렌더 장비는 녹음 확인과 같은 voice-clone 서비스다(COMPOSE_URL). 한 인스턴스만 띄운다.
export const composeRenderWorker = async (processEnv: NodeJS.ProcessEnv) => {
  const env = loadEnv(processEnv);
  if (env.COMPOSE_URL === undefined) throw new Error("렌더 워커에는 COMPOSE_URL(voice-clone 서비스)이 필요하다");
  const lock = await acquireSingleInstanceLock(env.DATABASE_URL, RENDER_WORKER_LOCK_KEY);
  if (lock === null) throw new Error("렌더 워커가 이미 떠 있다. 한 인스턴스만 띄운다");
  const connection = connectDatabase(env.DATABASE_URL);
  const polling = startRenderWorker(wireRenderWorker(renderInfrastructureOf(env, connection.database), env.COMPOSE_URL));
  return { stop: () => polling.stop().then(connection.close).then(lock.release), lockLost: lock.lost };
};
