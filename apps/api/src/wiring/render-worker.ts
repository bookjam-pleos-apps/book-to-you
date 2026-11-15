import { createRenderRepo } from "../adapters/db/repos/render-repo";
import { createRenderWorkerRepo } from "../adapters/db/repos/render-worker-repo";
import { startPolling } from "../adapters/polling/polling-loop";
import { createComposeRenderEngine } from "../adapters/render-job/compose-render-engine";
import { EMPTY_WORKER_MEMORY, tickRenderWorker, type WorkerLog, type WorkerMemory } from "../application/render-worker";
import { POLICY } from "../config";
import { describeError } from "../domain/describe-error";
import { wireBatchRender, type BatchInfrastructure } from "./batch";

// 두 워커가 같은 대기열을 나눠 잡으면 장비에 렌더가 두 벌 돌고, 한 번에 한 편이라는 계획(planWork)이 깨진다.
export const RENDER_WORKER_LOCK_KEY = 0x76735277;

type Tick = (memory: WorkerMemory, now: Date) => Promise<WorkerMemory>;

export const logWorkerEvent: WorkerLog = (event, fields) => {
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
};

export const wireRenderWorker = (infrastructure: BatchInfrastructure, composeUrl: string): Tick => {
  const { database, stories, scripts, storage } = infrastructure;
  const { requestTimeoutMs, transferTimeoutMs, ...workerPolicy } = POLICY.renderWorker;
  const engine = createComposeRenderEngine({ url: composeUrl, requestTimeoutMs, transferTimeoutMs });
  return tickRenderWorker({
    worker: createRenderWorkerRepo(database), renders: createRenderRepo(database), engine, stories, scripts, storage,
    policy: POLICY.batchRender, workerPolicy, publish: wireBatchRender(infrastructure).publish, log: logWorkerEvent,
  });
};

export const startRenderWorker = (tick: Tick) =>
  startPolling(tick, {
    initial: EMPTY_WORKER_MEMORY,
    intervalMs: POLICY.renderWorker.pollMs,
    onError: (error) => logWorkerEvent("step_failed", { detail: `tick: ${describeError(error)}` }),
  });
