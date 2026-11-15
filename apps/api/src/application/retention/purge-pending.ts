import { mapInSequence } from "../../domain/in-sequence";
import type { ObjectStorage } from "../ports/object-storage";
import type { EngineKeyPurger } from "../ports/engine-key-purger";
import type { PendingPurge, PurgeRepo } from "./ports";

export type PurgeDeps = {
  readonly purges: PurgeRepo;
  readonly storage: ObjectStorage;
  readonly engine: EngineKeyPurger;
  readonly reportFailure: (purgeId: string, error: unknown) => void;
};

export type PurgeSummary = {
  readonly purged: number;
  readonly failed: number;
};

const purgeOne = async ({ purges, storage, engine, reportFailure }: PurgeDeps, purge: PendingPurge): Promise<boolean> => {
  try {
    await storage.deletePrefix(purge.storagePrefix);
    if (purge.engineKeys.length > 0) await engine.purge(purge.engineKeys);
    await purges.markDone(purge.id);
    return true;
  } catch (error) {
    reportFailure(purge.id, error);
    return false;
  }
};

// 실패한 행은 지우지 않는다. 다음 재시도나 리컨실러가 같은 행을 다시 처리한다.
export const purgePending =
  (deps: PurgeDeps) =>
  async (): Promise<PurgeSummary> => {
    const pending = await deps.purges.listPending();
    const results = await mapInSequence(pending, (purge) => purgeOne(deps, purge));
    const purged = results.filter((done) => done).length;
    return { purged, failed: results.length - purged };
  };
