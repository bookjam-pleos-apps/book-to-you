import { describeError } from "../../domain/describe-error";
import { planWork, type WorkerPlan, type WorkerRow } from "../../domain/render-worker/render-worker-plan";
import { advanceActive } from "./advance-render";
import { cleanFinishedRows, cleanOrphans, type CleanupTarget } from "./clean-renders";
import { claimAndSubmit } from "./submit-render";
import type { Tracked, WorkerDeps } from "./worker-deps";

export type WorkerMemory = {
  readonly tracked: Tracked | null;
  readonly orphans: readonly CleanupTarget[];
};

export const EMPTY_WORKER_MEMORY: WorkerMemory = { tracked: null, orphans: [] };

// 기억하던 렌더의 행이 목록에서 통째로 사라졌다. 음성이 지워져 행이 cascade로 지워진 경우다.
const vanished = (tracked: Tracked | null, rows: readonly WorkerRow[], now: Date): readonly CleanupTarget[] => {
  if (tracked === null || rows.some((row) => row.renderId === tracked.renderId)) return [];
  return [{ ...tracked, finishedAt: now }];
};

const trackedOf = (row: WorkerRow | null): Tracked | null => (row === null ? null : { renderId: row.renderId, taskId: row.taskId });

const advance = (deps: WorkerDeps, plan: WorkerPlan, now: Date): Promise<Tracked | null> => {
  if (plan.active !== null) return advanceActive(deps, plan.active, now);
  if (plan.next !== null) return claimAndSubmit(deps, plan.next, now);
  return Promise.resolve(null);
};

// 장비나 저장소가 실패해도 이번 주기만 건너뛴다. 행에 남은 상태로 다음 주기에 이어서 판단한다.
const advanceGuarded = async (deps: WorkerDeps, plan: WorkerPlan, now: Date): Promise<Tracked | null> => {
  try {
    return await advance(deps, plan, now);
  } catch (error) {
    deps.log("step_failed", { renderId: (plan.active ?? plan.next)?.renderId, detail: describeError(error) });
    return trackedOf(plan.active);
  }
};

export const tickRenderWorker =
  (deps: WorkerDeps) =>
  async (memory: WorkerMemory, now: Date): Promise<WorkerMemory> => {
    const rows = await deps.worker.listWork();
    const plan = planWork(rows);
    await cleanFinishedRows(deps, plan.cleanups, now);
    const orphans = await cleanOrphans(deps, [...memory.orphans, ...vanished(memory.tracked, rows, now)], now);
    return { tracked: await advanceGuarded(deps, plan, now), orphans };
  };
