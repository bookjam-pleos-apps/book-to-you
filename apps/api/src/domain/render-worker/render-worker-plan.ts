import { isInProgressStatus, type RenderRowStatus } from "../renders/render-status";
import { oldestFirst } from "../renders/started-order";

// 렌더 워커가 보는 행. submittedAt이 있으면 워커가 잡은 행이다(운영자 배치 렌더는 비어 있다).
export type WorkerRow = {
  readonly renderId: string;
  readonly voiceId: string;
  readonly storyId: string;
  readonly status: RenderRowStatus;
  // 워커가 렌더 장비에 제출한 횟수다.
  readonly attempts: number;
  readonly taskId: string | null;
  readonly submittedAt: Date | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
};

// 장비의 task 상태. 닿지 않으면 시간 초과까지 기다리고, 다시 제출하지 않는다(렌더가 두 벌 돌 수 있다).
export type EngineTaskState = "running" | "completed" | "failed" | "gone" | "unreachable";

export type WorkerPolicy = {
  readonly timeoutMs: number;
  readonly maxSubmissions: number;
  // 취소 뒤에도 이미 보낸 단위 하나는 장비에서 돈다. 그동안 정리를 되풀이해 다시 생긴 폴더도 지운다.
  readonly cleanupGraceMs: number;
};

export type WorkerPlan = {
  readonly cleanups: readonly WorkerRow[];
  readonly active: WorkerRow | null;
  readonly next: WorkerRow | null;
};

export type ActiveDecision =
  | { readonly kind: "wait" | "collect" | "recover" }
  | { readonly kind: "stop"; readonly errorCode: "render_timeout" | "render_failed" };

export type RecoveryDecision = { readonly kind: "resubmit" } | { readonly kind: "stop"; readonly errorCode: "render_lost" };

const isWorkerOwned = (row: WorkerRow): boolean => row.submittedAt !== null;

const oldest = (rows: readonly WorkerRow[]): WorkerRow | null => rows.toSorted(oldestFirst)[0] ?? null;

// 끝났거나 사라질 행이라도 장비에 부모 음성이 든 작업 폴더가 남아 있을 수 있다.
export const needsCleanup = (row: WorkerRow): boolean => isWorkerOwned(row) && !isInProgressStatus(row.status);

// 한 번에 한 편만 맡긴다. 잡은 행이 있으면 새 행을 잡지 않는다. 워커가 잡지 않은 running 행(운영자 배치)은 건드리지 않는다.
export const planWork = (rows: readonly WorkerRow[]): WorkerPlan => {
  const active = oldest(rows.filter((row) => row.status === "running" && isWorkerOwned(row)));
  const next = active === null ? oldest(rows.filter((row) => row.status === "queued")) : null;
  return { cleanups: rows.filter(needsCleanup), active, next };
};

const timedOut = (row: WorkerRow, now: Date, policy: WorkerPolicy): boolean =>
  row.submittedAt !== null && now.getTime() - row.submittedAt.getTime() > policy.timeoutMs;

// 끝난 결과는 시간 초과보다 앞선다. task id가 없으면(제출 직후 워커가 죽음) 사라진 task로 본다.
export const decideActive = (row: WorkerRow, task: EngineTaskState, now: Date, policy: WorkerPolicy): ActiveDecision => {
  if (task === "completed") return { kind: "collect" };
  if (task === "failed") return { kind: "stop", errorCode: "render_failed" };
  if (timedOut(row, now, policy)) return { kind: "stop", errorCode: "render_timeout" };
  if (row.taskId === null || task === "gone") return { kind: "recover" };
  return { kind: "wait" };
};

// 사라진 task의 결과도 없을 때. 한 번만 다시 제출하고, 그다음은 멈춘다.
export const decideRecovery = (row: WorkerRow, policy: WorkerPolicy): RecoveryDecision =>
  row.attempts < policy.maxSubmissions ? { kind: "resubmit" } : { kind: "stop", errorCode: "render_lost" };

// 폴더가 이미 없다고 나와도 유예 시간 안에는 다시 생길 수 있어 계속 지운다.
export const isCleanupDone = (removed: boolean, finishedAt: Date | null, now: Date, policy: WorkerPolicy): boolean =>
  !removed && (finishedAt === null || now.getTime() - finishedAt.getTime() >= policy.cleanupGraceMs);
