import { PgBoss } from "pg-boss";

import type { JobQueue } from "../../application/ports/job-queue";

const QUEUES = { verifyClip: "verify-clip", verifyConsent: "verify-consent", purge: "purge", reconcile: "reconcile" } as const;

const RETRY = { retryLimit: 5, retryDelay: 60, retryBackoff: true };

const RECONCILE_DAILY_CRON = "0 3 * * *";

export type WorkerHandlers = {
  readonly purge: () => Promise<{ readonly failed: number }>;
  readonly reconcile: () => Promise<{ readonly failed: number }>;
};

const createAllQueues = async (boss: PgBoss): Promise<void> => {
  await Promise.all(Object.values(QUEUES).map((name) => boss.createQueue(name)));
};

export type BossRuntime = {
  readonly queue: JobQueue;
  readonly stop: () => Promise<void>;
};

const jobQueueOf = (boss: PgBoss): JobQueue => ({
  enqueueVerifyClip: async (clipId) => void (await boss.send(QUEUES.verifyClip, { clipId }, RETRY)),
  enqueueVerifyConsent: async (consentId) => void (await boss.send(QUEUES.verifyConsent, { consentId }, RETRY)),
  enqueuePurge: async () => void (await boss.send(QUEUES.purge, {}, RETRY)),
});

// API 프로세스는 넣기만 한다. 유지보수와 스케줄은 워커가 맡아 프로세스마다 중복으로 돌지 않게 한다.
export const startProducer = async (connectionString: string): Promise<BossRuntime> => {
  const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
  boss.on("error", console.error);
  await boss.start();
  await createAllQueues(boss);
  return { queue: jobQueueOf(boss), stop: () => boss.stop() };
};

const failOnPartialFailure = async (run: () => Promise<{ readonly failed: number }>): Promise<void> => {
  const { failed } = await run();
  if (failed > 0) throw new Error(`${failed} purge(s) failed`);
};

export const startWorker = async (
  connectionString: string,
  createHandlers: (queue: JobQueue) => WorkerHandlers,
): Promise<{ readonly stop: () => Promise<void> }> => {
  const boss = new PgBoss(connectionString);
  boss.on("error", console.error);
  await boss.start();
  await createAllQueues(boss);
  const handlers = createHandlers(jobQueueOf(boss));
  await boss.work(QUEUES.purge, () => failOnPartialFailure(handlers.purge));
  await boss.work(QUEUES.reconcile, () => failOnPartialFailure(handlers.reconcile));
  await boss.schedule(QUEUES.reconcile, RECONCILE_DAILY_CRON);
  return { stop: () => boss.stop() };
};
