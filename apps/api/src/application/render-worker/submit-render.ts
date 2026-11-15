import type { WorkerRow } from "../../domain/render-worker/render-worker-plan";
import { newRenderOf, prepareRender, submissionOf, type PrepareFailure, type RenderChoice } from "../renders";
import type { Tracked, WorkerDeps } from "./worker-deps";

const prepareFor = (deps: WorkerDeps, row: WorkerRow): Promise<RenderChoice | PrepareFailure> =>
  prepareRender(deps, { voiceId: row.voiceId, storyId: row.storyId });

// 앞선 제출이 남긴 폴더가 있으면 장비가 풀기를 거부한다. 지우고 낸다.
// 제출하는 사이 행이 끝나면(운영자 abandon) task를 기록할 곳이 없다. 추적되지 않은 렌더가 GPU를 쓰지 않게 바로 취소한다.
const sendJob = async (deps: WorkerDeps, renderId: string, choice: RenderChoice, now: Date): Promise<Tracked | null> => {
  const { job, referenceWavs } = await submissionOf(deps, renderId, choice);
  await deps.engine.cleanup(renderId);
  const taskId = await deps.engine.submit(job, referenceWavs);
  if (await deps.worker.recordTask(renderId, taskId, now)) {
    deps.log("submitted", { renderId, detail: taskId });
    return { renderId, taskId };
  }
  await deps.engine.cancel(taskId);
  deps.log("stopped", { renderId, detail: `${taskId}: 제출하는 사이 행이 끝나 취소함` });
  return null;
};

// 요청 뒤에 녹음이 바뀌었을 수 있어 잡기 직전에 다시 계획한다. 계획할 수 없으면 그 이유로 실패시킨다.
export const claimAndSubmit = async (deps: WorkerDeps, row: WorkerRow, now: Date): Promise<Tracked | null> => {
  const choice = await prepareFor(deps, row);
  if (choice.kind !== "ready") {
    await deps.worker.failQueued(row.renderId, choice.kind, now);
    deps.log("not_claimed", { renderId: row.renderId, detail: choice.kind });
    return null;
  }
  const outcome = await deps.worker.claim(row.renderId, newRenderOf(deps.policy, row.voiceId, choice, now), now);
  deps.log(outcome === "claimed" ? "claimed" : "not_claimed", { renderId: row.renderId, detail: outcome });
  return outcome === "claimed" ? sendJob(deps, row.renderId, choice, now) : null;
};

export const resubmit = async (deps: WorkerDeps, row: WorkerRow, now: Date): Promise<Tracked | null> => {
  const choice = await prepareFor(deps, row);
  if (choice.kind !== "ready") {
    await deps.renders.fail(row.renderId, choice.kind, now);
    deps.log("stopped", { renderId: row.renderId, detail: choice.kind });
    return null;
  }
  deps.log("resubmitting", { renderId: row.renderId, detail: `submissions ${row.attempts}` });
  return sendJob(deps, row.renderId, choice, now);
};
