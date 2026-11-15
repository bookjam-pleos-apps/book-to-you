import type { Database } from "../adapters/db/client";
import { createPurgeRepo, createRetentionRepo } from "../adapters/db/repos/retention-repo";
import type { Clock } from "../application/ports/clock";
import type { EngineKeyPurger } from "../application/ports/engine-key-purger";
import type { JobQueue } from "../application/ports/job-queue";
import type { ObjectStorage } from "../application/ports/object-storage";
import { purgePending, reconcileOrphans } from "../application/retention";
import { POLICY } from "../config";

export type RetentionInfrastructure = {
  readonly database: Database;
  readonly storage: ObjectStorage;
  readonly engine: EngineKeyPurger;
  readonly queue: JobQueue;
  readonly clock: Clock;
};

const logFailure =
  (task: string) =>
  (subject: string, error: unknown): void => {
    console.error(`[${task}] ${subject}`, error);
  };

export const wireRetention = ({ database, storage, engine, queue, clock }: RetentionInfrastructure) => {
  const purge = purgePending({ purges: createPurgeRepo(database), storage, engine, reportFailure: logFailure("purge") });
  const reconcile = reconcileOrphans({
    purgeAll: purge,
    retention: createRetentionRepo(database),
    storage,
    queue,
    clock,
    graceMs: POLICY.orphanGraceMs,
    otpHistoryMs: POLICY.otpHistoryMs,
    reportFailure: logFailure("reconcile"),
  });
  return { purge, reconcile };
};
