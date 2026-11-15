import { USER_OBJECTS_PREFIX } from "../../domain/storage-keys";
import type { Clock } from "../ports/clock";
import { requestVerifyClip, requestVerifyConsent, type JobQueue } from "../ports/job-queue";
import type { ObjectStorage, StoredObjectInfo } from "../ports/object-storage";
import type { RetentionRepo } from "./ports";
import type { PurgeSummary } from "./purge-pending";

export type ReconcileDeps = {
  readonly purgeAll: () => Promise<PurgeSummary>;
  readonly retention: RetentionRepo;
  readonly storage: ObjectStorage;
  readonly queue: JobQueue;
  readonly clock: Clock;
  readonly graceMs: number;
  readonly otpHistoryMs: number;
  readonly reportFailure: (phase: string, error: unknown) => void;
};

export type ReconcileSummary = PurgeSummary & {
  readonly orphansDeleted: number;
  readonly verifyRequeued: number;
};

const isPastGrace = (object: StoredObjectInfo, now: Date, graceMs: number): boolean =>
  now.getTime() - object.lastModified.getTime() > graceMs;

// DB가 참조하지 않는 객체는 지운다. 접두사 고아, 업로드 중 크래시, 확인이 끝난 낭독을 한 규칙으로 처리한다.
// 객체를 먼저 쓰고 행을 나중에 넣는 업로드가 진행 중일 수 있어 유예 시간을 둔다.
const deleteOrphans = async ({ retention, storage, clock, graceMs }: ReconcileDeps): Promise<number> => {
  const now = clock();
  const objects = await storage.list(USER_OBJECTS_PREFIX);
  const candidates = objects.filter((object) => isPastGrace(object, now, graceMs)).map((object) => object.key);
  const referenced = await retention.findReferencedKeys(candidates);
  const orphans = candidates.filter((key) => !referenced.has(key));
  await storage.deleteKeys(orphans);
  return orphans.length;
};

// 등록 실패나 재시도 소진으로 멈춘 확인을 되살린다. 그래서 verify 작업은 같은 id를 두 번 받아도 안전해야 한다.
const requeueChecking = async ({ retention, queue }: ReconcileDeps): Promise<number> => {
  const { clipIds, consentIds } = await retention.listChecking();
  await Promise.all([
    ...clipIds.map((id) => requestVerifyClip(queue, id)),
    ...consentIds.map((id) => requestVerifyConsent(queue, id)),
  ]);
  return clipIds.length + consentIds.length;
};

const deleteExpiredAuthRows = ({ retention, clock, otpHistoryMs }: ReconcileDeps): Promise<void> => {
  const now = clock();
  return retention.deleteExpiredAuthRows(now, new Date(now.getTime() - otpHistoryMs));
};

type PhaseResult<Value> = { readonly value: Value; readonly failed: number };

// 한 단계가 실패해도 나머지는 진행한다. 실패 수를 돌려주면 작업이 재시도되고, 모든 단계는 다시 돌려도 안전하다.
const runPhase = async <Value>(
  deps: ReconcileDeps,
  phase: string,
  fallback: Value,
  run: () => Promise<Value>,
): Promise<PhaseResult<Value>> => {
  try {
    return { value: await run(), failed: 0 };
  } catch (error) {
    deps.reportFailure(phase, error);
    return { value: fallback, failed: 1 };
  }
};

export const reconcileOrphans =
  (deps: ReconcileDeps) =>
  async (): Promise<ReconcileSummary> => {
    const purge = await runPhase(deps, "purge", { purged: 0, failed: 0 }, deps.purgeAll);
    const orphans = await runPhase(deps, "orphans", 0, () => deleteOrphans(deps));
    const requeue = await runPhase(deps, "requeue", 0, () => requeueChecking(deps));
    const auth = await runPhase(deps, "auth-rows", undefined, () => deleteExpiredAuthRows(deps));
    return {
      purged: purge.value.purged,
      failed: purge.value.failed + purge.failed + orphans.failed + requeue.failed + auth.failed,
      orphansDeleted: orphans.value,
      verifyRequeued: requeue.value,
    };
  };
