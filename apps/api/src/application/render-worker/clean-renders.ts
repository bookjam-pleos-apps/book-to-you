import { describeError } from "../../domain/describe-error";
import { mapInSequence } from "../../domain/in-sequence";
import { isCleanupDone, type WorkerRow } from "../../domain/render-worker/render-worker-plan";
import type { WorkerDeps } from "./worker-deps";

// 장비에 남은 부모 음성. 행이 끝났거나(성공, 실패, 운영자 abandon) 사라졌을 때(음성 삭제 cascade) 지운다.
export type CleanupTarget = { readonly renderId: string; readonly taskId: string | null; readonly finishedAt: Date | null };

const targetOf = ({ renderId, taskId, finishedAt }: WorkerRow): CleanupTarget => ({ renderId, taskId, finishedAt });

// 정리는 결과와 관계없이 돈다. 하나가 실패해도 나머지는 계속하고, 실패한 것은 다음 주기에 다시 한다.
const cleanOne = async (deps: WorkerDeps, target: CleanupTarget, now: Date): Promise<boolean> => {
  try {
    if (target.taskId !== null) await deps.engine.cancel(target.taskId);
    const removed = await deps.engine.cleanup(target.renderId);
    if (removed) deps.log("cleaned", { renderId: target.renderId });
    return isCleanupDone(removed, target.finishedAt, now, deps.workerPolicy);
  } catch (error) {
    deps.log("step_failed", { renderId: target.renderId, detail: `cleanup: ${describeError(error)}` });
    return false;
  }
};

const cleanInOrder = (deps: WorkerDeps, targets: readonly CleanupTarget[], now: Date): Promise<readonly boolean[]> =>
  mapInSequence(targets, (target) => cleanOne(deps, target, now));

export const cleanFinishedRows = async (deps: WorkerDeps, rows: readonly WorkerRow[], now: Date): Promise<void> => {
  const done = await cleanInOrder(deps, rows.map(targetOf), now);
  const cleared = rows.filter((_, index) => done[index] === true);
  await Promise.all(cleared.map((row) => deps.worker.clearTask(row.renderId)));
};

// 남은 대상만 돌려준다. 메모리에만 있어서 워커가 다시 뜨면 잊는다.
export const cleanOrphans = async (deps: WorkerDeps, orphans: readonly CleanupTarget[], now: Date): Promise<readonly CleanupTarget[]> => {
  const done = await cleanInOrder(deps, orphans, now);
  return orphans.filter((_, index) => done[index] !== true);
};
