import { and, eq, ne, sql } from "drizzle-orm";

import type { RenderRepo, FinishedChapter, NewRender, RenderBegun, RenderCompletion, RenderSource, RunningRender } from "../../../application/renders/ports";
import type { RenderRowStatus } from "../../../domain/renders/render-status";
import type { Database } from "../client";
import { renderChapters, renders, voiceClips, voiceProfiles } from "../schema";
import { hasActiveConsent, lockActiveConsentId, lockOwnerAndActiveConsent } from "./consent-gate";
import { renderedFailuresBefore } from "./prior-failures";
import { pairFilter, planColumnsOf } from "./render-columns";

const findSource = async (database: Database, voiceId: string): Promise<RenderSource | null> => {
  const [voice] = await database.select({ userId: voiceProfiles.userId }).from(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
  if (voice === undefined) return null;
  const passedClips = await database
    .select({ id: voiceClips.id, style: voiceClips.style, storageKey: voiceClips.storageKey, scriptId: voiceClips.scriptId, scriptVersion: voiceClips.scriptVersion })
    .from(voiceClips)
    .where(and(eq(voiceClips.voiceProfileId, voiceId), eq(voiceClips.status, "passed")));
  return { userId: voice.userId, consentActive: await hasActiveConsent(database, voiceId, voice.userId), passedClips };
};

// 운영자의 abandon은 음성 행을 잠그지 않는다. 그 사이 실패로 바뀌었으면 가져가지 않고 새로 시작한다.
const claimQueued = async (database: Database, renderId: string): Promise<RenderBegun | null> => {
  const claimed = await database
    .update(renders)
    .set({ status: "running", attempts: sql`${renders.attempts} + 1` })
    .where(and(eq(renders.id, renderId), eq(renders.status, "queued")))
    .returning({ id: renders.id });
  return claimed.length === 1 ? { kind: "started", renderId } : null;
};

const queuedOfPair = async (database: Database, { userId, voiceId, storyId }: NewRender): Promise<string | null> => {
  const [row] = await database
    .select({ id: renders.id })
    .from(renders)
    .where(and(pairFilter(userId, voiceId, storyId), eq(renders.status, "queued")));
  return row?.id ?? null;
};

// 이미 끝난 렌더가 있는데 같은 쌍의 대기 행이 남으면 화면에 계속 만드는 중으로 보인다.
const supersedeQueued = async (database: Database, render: NewRender, renderId: string): Promise<RenderBegun> => {
  const queuedId = await queuedOfPair(database, render);
  if (queuedId === null) return { kind: "already_rendered", renderId };
  await database
    .update(renders)
    .set({ status: "failed", errorCode: "superseded", finishedAt: render.startedAt })
    .where(and(eq(renders.id, queuedId), eq(renders.status, "queued")));
  return { kind: "already_rendered", renderId };
};

type ExistingRender = { readonly id: string; readonly status: RenderRowStatus; readonly engineSubmittedAt: Date | null };

// 돌고 있는 렌더는 기본으로 거부한다. 앞 실행이 죽은 것을 운영자가 확인하고 resume을 줄 때만 이어받는다.
// 렌더 워커가 잡은 행은 resume으로도 가져가지 않는다. 워커가 다시 뜨면 그 task부터 이어서 조회한다.
const takeExisting = async (database: Database, render: NewRender, existing: ExistingRender, resume: boolean): Promise<RenderBegun> => {
  if (existing.status === "succeeded") return supersedeQueued(database, render, existing.id);
  if (existing.status === "queued") return (await claimQueued(database, existing.id)) ?? insertRunning(database, render);
  if (!resume || existing.engineSubmittedAt !== null) return { kind: "already_running", renderId: existing.id };
  await database.update(renders).set({ attempts: sql`${renders.attempts} + 1` }).where(eq(renders.id, existing.id));
  return { kind: "started", renderId: existing.id };
};

// 부모가 요청한 뒤 녹음이 바뀌면 키가 달라진다. 대기 행을 지금 계획으로 바꿔 가져가 같은 쌍에 행이 둘 생기지 않게 한다.
const rekeyQueued = async (database: Database, render: NewRender): Promise<RenderBegun | null> => {
  const queuedId = await queuedOfPair(database, render);
  if (queuedId === null) return null;
  await database.update(renders).set(planColumnsOf(render)).where(and(eq(renders.id, queuedId), eq(renders.status, "queued")));
  return claimQueued(database, queuedId);
};

const insertRunning = async (database: Database, { voiceId, refClipIds, startedAt, ...render }: NewRender): Promise<RenderBegun> => {
  const [inserted] = await database
    .insert(renders)
    .values({ ...render, voiceProfileId: voiceId, refClipIds: [...refClipIds], status: "running", startedAt, attempts: 1 })
    .returning({ id: renders.id });
  if (inserted === undefined) throw new Error("렌더 행을 만들지 못했다");
  return { kind: "started", renderId: inserted.id };
};

// 음성 행을 잠근 채라 같은 음성의 확인과 삽입 사이에 다른 시작이 끼어들지 못한다.
const beginUnderLock = async (database: Database, render: NewRender, resume: boolean): Promise<RenderBegun> => {
  if (!(await lockOwnerAndActiveConsent(database, render.voiceId, render.userId))) return { kind: "no_active_consent" };
  const [existing] = await database
    .select({ id: renders.id, status: renders.status, engineSubmittedAt: renders.engineSubmittedAt })
    .from(renders)
    .where(and(eq(renders.renderKey, render.renderKey), ne(renders.status, "failed")));
  if (existing !== undefined) return takeExisting(database, render, existing, resume);
  return (await rekeyQueued(database, render)) ?? insertRunning(database, render);
};

// 상태를 먼저 바꾼다. 게시가 겹치면 진 쪽은 끝난 렌더의 챕터를 건드리지 못한다.
const completeUnderLock = async (database: Database, renderId: string, running: RunningRender, chapters: readonly FinishedChapter[], now: Date): Promise<RenderCompletion> => {
  if ((await lockActiveConsentId(database, running.voiceId, running.userId)) === null) return "no_active_consent";
  const done = await database
    .update(renders)
    .set({ status: "succeeded", chaptersDone: chapters.length, chaptersTotal: chapters.length, finishedAt: now })
    .where(and(eq(renders.id, renderId), eq(renders.status, "running")))
    .returning({ id: renders.id });
  if (done.length !== 1) return "not_running";
  await database.insert(renderChapters).values(chapters.map((chapter) => ({ renderId, ...chapter })));
  return "completed";
};

export const createRenderRepo = (database: Database): RenderRepo => ({
  findSource: (voiceId) => findSource(database, voiceId),
  begin: (render, resume) => database.transaction((transaction) => beginUnderLock(transaction, render, resume)),
  findRunning: async (renderId) => {
    const [row] = await database
      .select({ userId: renders.userId, voiceId: renders.voiceProfileId, storyId: renders.storyId, storyVersion: renders.storyVersion })
      .from(renders)
      .where(and(eq(renders.id, renderId), eq(renders.status, "running")));
    return row ?? null;
  },
  complete: (renderId, running, chapters, now) =>
    database.transaction((transaction) => completeUnderLock(transaction, renderId, running, chapters, now)),
  fail: async (renderId, errorCode, now) => {
    await database
      .update(renders)
      .set({ status: "failed", errorCode, finishedAt: now })
      .where(and(eq(renders.id, renderId), eq(renders.status, "running")));
  },
  priorFailures: (renderId) => renderedFailuresBefore(database, renderId),
});
