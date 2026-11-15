import { and, asc, eq, inArray } from "drizzle-orm";

import type { LibraryRepo, PlayableRender } from "../../../application/library/ports";
import { CHAPTER_CONTENT_TYPE, WAV_CONTENT_TYPE } from "../../../domain/audio-content-type";
import { latestRenderIds } from "../../../domain/library/latest-render";
import type { Database } from "../client";
import { consentRecords, renderChapters, renders, voiceProfiles, voicePrompts } from "../schema";
import { activeConsentOfVoice } from "./consent-gate";

const playableRenderFilter = (userId: string) => and(eq(renders.userId, userId), eq(renders.status, "succeeded"));

const selectPlayableRenders = (database: Database, userId: string) =>
  database
    .select({
      renderId: renders.id,
      storyId: renders.storyId,
      voiceId: voiceProfiles.id,
      voiceLabel: voiceProfiles.label,
      finishedAt: renders.finishedAt,
    })
    .from(renders)
    .innerJoin(voiceProfiles, eq(voiceProfiles.id, renders.voiceProfileId))
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(playableRenderFilter(userId));

const selectChapters = (database: Database, renderIds: readonly string[]) =>
  renderIds.length === 0
    ? Promise.resolve([])
    : database
        .select()
        .from(renderChapters)
        .where(inArray(renderChapters.renderId, [...renderIds]))
        .orderBy(asc(renderChapters.index));

// 다시 렌더한 이야기는 가장 최근 것만 내보낸다. 끝난 시각은 고르는 데만 쓰고 manifest에는 넣지 않는다.
const selectLatestRenders = async (database: Database, userId: string) => {
  const rows = await selectPlayableRenders(database, userId);
  const latest = latestRenderIds(rows.map(({ renderId, voiceId, storyId, finishedAt }) => ({ id: renderId, voiceId, storyId, finishedAt })));
  return rows.filter((row) => latest.has(row.renderId)).map(({ renderId, storyId, voiceId, voiceLabel }) => ({ renderId, storyId, voiceId, voiceLabel }));
};

const listPlayableRenders = async (database: Database, userId: string): Promise<readonly PlayableRender[]> => {
  const rows = await selectLatestRenders(database, userId);
  const chapters = await selectChapters(database, rows.map((row) => row.renderId));
  return rows.map((row) => ({ ...row, chapters: chapters.filter((chapter) => chapter.renderId === row.renderId) }));
};

const findShelfRender = async (database: Database, renderId: string, userId: string) =>
  (await selectLatestRenders(database, userId)).find((render) => render.renderId === renderId) ?? null;

const listPlayablePrompts = (database: Database, userId: string) =>
  database
    .select({
      id: voicePrompts.id,
      kind: voicePrompts.kind,
      voiceId: voiceProfiles.id,
      durationMs: voicePrompts.durationMs,
      bytes: voicePrompts.bytes,
      sha256: voicePrompts.sha256,
    })
    .from(voicePrompts)
    .innerJoin(voiceProfiles, eq(voiceProfiles.id, voicePrompts.voiceProfileId))
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(eq(voiceProfiles.userId, userId));

// 동의가 철회된 대표 목소리는 차량이 고를 수 없으므로 없는 것으로 본다.
const findDefaultVoiceId = async (database: Database, userId: string): Promise<string | null> => {
  const [row] = await database
    .select({ id: voiceProfiles.id })
    .from(voiceProfiles)
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(and(eq(voiceProfiles.userId, userId), eq(voiceProfiles.isDefault, true)));
  return row?.id ?? null;
};

const findPlayableChapter = async (database: Database, audioId: string, userId: string) => {
  const [row] = await database
    .select({ storageKey: renderChapters.storageKey, bytes: renderChapters.bytes, sha256: renderChapters.sha256 })
    .from(renderChapters)
    .innerJoin(renders, eq(renders.id, renderChapters.renderId))
    .innerJoin(voiceProfiles, eq(voiceProfiles.id, renders.voiceProfileId))
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(and(eq(renderChapters.id, audioId), playableRenderFilter(userId)));
  return row === undefined ? null : { ...row, contentType: CHAPTER_CONTENT_TYPE };
};

const findPlayablePrompt = async (database: Database, audioId: string, userId: string) => {
  const [row] = await database
    .select({ storageKey: voicePrompts.storageKey, bytes: voicePrompts.bytes, sha256: voicePrompts.sha256 })
    .from(voicePrompts)
    .innerJoin(voiceProfiles, eq(voiceProfiles.id, voicePrompts.voiceProfileId))
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(and(eq(voicePrompts.id, audioId), eq(voiceProfiles.userId, userId)));
  return row === undefined ? null : { ...row, contentType: WAV_CONTENT_TYPE };
};

export const createLibraryRepo = (database: Database): LibraryRepo => ({
  listPlayableRenders: (userId) => listPlayableRenders(database, userId),
  findShelfRender: (renderId, userId) => findShelfRender(database, renderId, userId),
  listRenderChapters: (renderId) => selectChapters(database, [renderId]),
  listPlayablePrompts: (userId) => listPlayablePrompts(database, userId),
  findDefaultVoiceId: (userId) => findDefaultVoiceId(database, userId),
  findPlayableChapter: (audioId, userId) => findPlayableChapter(database, audioId, userId),
  findPlayableAudio: async (audioId, userId) =>
    (await findPlayableChapter(database, audioId, userId)) ?? findPlayablePrompt(database, audioId, userId),
});
