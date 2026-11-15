import type { RenderFailureCode } from "../../domain/renders/render-failure";
import { decideActive, decideRecovery, type WorkerRow } from "../../domain/render-worker/render-worker-plan";
import type { RenderOutput } from "./ports";
import type { PublishRenderResult } from "../renders";
import { resubmit } from "./submit-render";
import type { Tracked, WorkerDeps } from "./worker-deps";

// 장 계획대로 나누지 못하고 장 하나로 올렸으면 그 까닭을 남긴다.
const publishDetailOf = (result: PublishRenderResult): string =>
  result.kind === "published" && result.chapterProblem !== null ? `published_as_one_chapter:${result.chapterProblem}` : result.kind;

const trackedOf = (row: WorkerRow): Tracked => ({ renderId: row.renderId, taskId: row.taskId });

// 게시가 QC 판정까지 한다. 실패로 돌리는 것도 게시가 한다. 장비 정리는 다음 정리 단계가 맡는다.
const publish = async (deps: WorkerDeps, row: WorkerRow, output: RenderOutput): Promise<null> => {
  const result = await deps.publish({ renderId: row.renderId, ...output });
  deps.log(result.kind === "published" ? "published" : "not_published", { renderId: row.renderId, detail: publishDetailOf(result) });
  return null;
};

const stop = async (deps: WorkerDeps, row: WorkerRow, errorCode: RenderFailureCode, now: Date): Promise<null> => {
  await deps.renders.fail(row.renderId, errorCode, now);
  if (row.taskId !== null) await deps.engine.cancel(row.taskId);
  deps.log("stopped", { renderId: row.renderId, detail: errorCode });
  return null;
};

const collect = async (deps: WorkerDeps, row: WorkerRow, now: Date): Promise<null> => {
  const output = await deps.engine.result(row.renderId);
  return output === null ? stop(deps, row, "render_result_missing", now) : publish(deps, row, output);
};

// task가 사라졌다(장비 재시작, 1시간 보관 만료, 제출 직후 워커 종료). 끝난 결과가 남았으면 그것을 쓴다.
const recover = async (deps: WorkerDeps, row: WorkerRow, now: Date): Promise<Tracked | null> => {
  const output = await deps.engine.result(row.renderId);
  if (output !== null) return publish(deps, row, output);
  const decision = decideRecovery(row, deps.workerPolicy);
  return decision.kind === "resubmit" ? resubmit(deps, row, now) : stop(deps, row, decision.errorCode, now);
};

export const advanceActive = async (deps: WorkerDeps, row: WorkerRow, now: Date): Promise<Tracked | null> => {
  const task = row.taskId === null ? "gone" : await deps.engine.taskState(row.taskId);
  const decision = decideActive(row, task, now, deps.workerPolicy);
  if (decision.kind === "wait") return trackedOf(row);
  if (decision.kind === "collect") return collect(deps, row, now);
  if (decision.kind === "stop") return stop(deps, row, decision.errorCode, now);
  return recover(deps, row, now);
};
