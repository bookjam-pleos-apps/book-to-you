import { and, eq, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";

import type { ClaimOutcome, RenderWorkerRepo } from "../../../application/render-worker/ports";
import type { NewRender } from "../../../application/renders/ports";
import { IN_PROGRESS_STATUSES } from "../../../domain/renders/render-status";
import type { RenderFailureCode } from "../../../domain/renders/render-failure";
import type { WorkerRow } from "../../../domain/render-worker/render-worker-plan";
import type { Database } from "../client";
import { renders } from "../schema";
import { lockOwnerAndActiveConsent } from "./consent-gate";
import { planColumnsOf } from "./render-columns";

const inProgress = inArray(renders.status, [...IN_PROGRESS_STATUSES]);

const listWork = (database: Database): Promise<readonly WorkerRow[]> =>
  database
    .select({
      renderId: renders.id, voiceId: renders.voiceProfileId, storyId: renders.storyId, status: renders.status, attempts: renders.attempts,
      taskId: renders.engineTaskId, submittedAt: renders.engineSubmittedAt, startedAt: renders.startedAt, finishedAt: renders.finishedAt,
    })
    .from(renders)
    .where(or(inProgress, isNotNull(renders.engineSubmittedAt)))
    .orderBy(renders.startedAt);

const failQueued = async (database: Database, renderId: string, errorCode: RenderFailureCode, now: Date): Promise<void> => {
  await database
    .update(renders)
    .set({ status: "failed", errorCode, finishedAt: now })
    .where(and(eq(renders.id, renderId), eq(renders.status, "queued")));
};

const hasOtherWithKey = async (database: Database, renderId: string, renderKey: string): Promise<boolean> => {
  const [other] = await database
    .select({ id: renders.id })
    .from(renders)
    .where(and(eq(renders.renderKey, renderKey), ne(renders.status, "failed"), ne(renders.id, renderId)));
  return other !== undefined;
};

const takeQueued = async (database: Database, renderId: string, render: NewRender, now: Date): Promise<ClaimOutcome> => {
  const claimed = await database
    .update(renders)
    .set({ ...planColumnsOf(render), status: "running", engineTaskId: null, engineSubmittedAt: now })
    .where(and(eq(renders.id, renderId), eq(renders.status, "queued")))
    .returning({ id: renders.id });
  return claimed.length === 1 ? "claimed" : "not_queued";
};

// 사용자와 음성을 잠근 채라 판단과 가져가기 사이에 철회나 삭제가 끼어들지 못한다.
// 같은 키가 이미 있으면(운영자 배치가 먼저 렌더) 이 대기 행은 화면에 계속 만드는 중으로 남지 않게 실패로 돌린다.
const claimUnderLock = async (database: Database, renderId: string, render: NewRender, now: Date): Promise<ClaimOutcome> => {
  if (!(await lockOwnerAndActiveConsent(database, render.voiceId, render.userId))) {
    await failQueued(database, renderId, "no_active_consent", now);
    return "no_active_consent";
  }
  if (await hasOtherWithKey(database, renderId, render.renderKey)) {
    await failQueued(database, renderId, "superseded", now);
    return "superseded";
  }
  return takeQueued(database, renderId, render, now);
};

const recordTask = async (database: Database, renderId: string, taskId: string, now: Date): Promise<boolean> => {
  const recorded = await database
    .update(renders)
    .set({ engineTaskId: taskId, engineSubmittedAt: now, attempts: sql`${renders.attempts} + 1` })
    .where(and(eq(renders.id, renderId), eq(renders.status, "running"), isNotNull(renders.engineSubmittedAt)))
    .returning({ id: renders.id });
  return recorded.length === 1;
};

// 끝난 행만 비운다. 진행 중인 행의 task를 지우면 워커가 그 렌더를 잃는다.
const clearTask = async (database: Database, renderId: string): Promise<void> => {
  await database
    .update(renders)
    .set({ engineTaskId: null, engineSubmittedAt: null })
    .where(and(eq(renders.id, renderId), notInArray(renders.status, [...IN_PROGRESS_STATUSES])));
};

export const createRenderWorkerRepo = (database: Database): RenderWorkerRepo => ({
  listWork: () => listWork(database),
  claim: (renderId, render, now) => database.transaction((transaction) => claimUnderLock(transaction, renderId, render, now)),
  failQueued: (renderId, errorCode, now) => failQueued(database, renderId, errorCode, now),
  recordTask: (renderId, taskId, now) => recordTask(database, renderId, taskId, now),
  clearTask: (renderId) => clearTask(database, renderId),
});
