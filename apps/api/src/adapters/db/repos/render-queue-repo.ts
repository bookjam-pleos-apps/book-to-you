import { and, count, desc, eq, inArray, ne } from "drizzle-orm";

import type { NewRender, PendingRender, QueueOutcome, RenderQueueRepo } from "../../../application/renders/ports";
import { IN_PROGRESS_STATUSES, isInProgressStatus } from "../../../domain/renders/render-status";
import type { Database } from "../client";
import { renders } from "../schema";
import { lockOwnerAndActiveConsent } from "./consent-gate";
import { pairFilter } from "./render-columns";
import { selectRenderRows } from "./render-list-repo";

const inProgress = inArray(renders.status, [...IN_PROGRESS_STATUSES]);

const existingIdOfPair = async (database: Database, { userId, voiceId, storyId, renderKey }: NewRender): Promise<string | null> => {
  const [pending] = await database
    .select({ id: renders.id })
    .from(renders)
    .where(and(pairFilter(userId, voiceId, storyId), inProgress))
    .orderBy(desc(renders.startedAt))
    .limit(1);
  if (pending !== undefined) return pending.id;
  const [sameKey] = await database
    .select({ id: renders.id })
    .from(renders)
    .where(and(eq(renders.renderKey, renderKey), ne(renders.status, "failed")));
  return sameKey?.id ?? null;
};

const pendingCountOf = async (database: Database, userId: string): Promise<number> => {
  const [row] = await database
    .select({ total: count() })
    .from(renders)
    .where(and(eq(renders.userId, userId), inProgress));
  return row?.total ?? 0;
};

const rowOf = async (database: Database, renderId: string) => {
  const [row] = await selectRenderRows(database, eq(renders.id, renderId));
  if (row === undefined) throw new Error(`렌더 행을 찾지 못했다: ${renderId}`);
  return row;
};

// 사용자와 음성을 잠근 채라 판단과 삽입 사이에 철회나 삭제가 끼어들지 못한다.
const enqueueUnderLock = async (database: Database, render: NewRender, maxPending: number): Promise<QueueOutcome> => {
  const { userId, voiceId, startedAt, refClipIds, ...rest } = render;
  if (!(await lockOwnerAndActiveConsent(database, voiceId, userId))) return { kind: "no_active_consent" };
  const existingId = await existingIdOfPair(database, render);
  if (existingId !== null) return { kind: "existing", row: await rowOf(database, existingId) };
  if ((await pendingCountOf(database, userId)) >= maxPending) return { kind: "too_many_pending" };
  const [inserted] = await database
    .insert(renders)
    .values({ ...rest, userId, voiceProfileId: voiceId, refClipIds: [...refClipIds], status: "queued", startedAt })
    .returning({ id: renders.id });
  if (inserted === undefined) throw new Error("대기 렌더를 만들지 못했다");
  return { kind: "queued", row: await rowOf(database, inserted.id) };
};

const listPending = (database: Database): Promise<readonly PendingRender[]> =>
  database
    .select({ renderId: renders.id, voiceId: renders.voiceProfileId, storyId: renders.storyId, status: renders.status, startedAt: renders.startedAt, attempts: renders.attempts })
    .from(renders)
    .where(inProgress)
    .orderBy(renders.startedAt)
    .then((rows) => rows.flatMap(({ status, ...row }) => (isInProgressStatus(status) ? [{ ...row, status }] : [])));

const abandon = async (database: Database, renderId: string, now: Date): Promise<boolean> => {
  const done = await database
    .update(renders)
    .set({ status: "failed", errorCode: "abandoned", finishedAt: now })
    .where(and(eq(renders.id, renderId), inProgress))
    .returning({ id: renders.id });
  return done.length === 1;
};

export const createRenderQueueRepo = (database: Database): RenderQueueRepo => ({
  enqueue: (render, maxPending) => database.transaction((transaction) => enqueueUnderLock(transaction, render, maxPending)),
  listPending: () => listPending(database),
  abandon: (renderId, now) => abandon(database, renderId, now),
});

