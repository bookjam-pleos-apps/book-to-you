import { and, eq } from "drizzle-orm";

import type { ChapterizeRepo, ChapterReplacement, SingleChapterRender } from "../../../application/chapterize/ports";
import type { FinishedChapter } from "../../../application/renders/ports";
import type { Database } from "../client";
import { renderChapters, renders } from "../schema";
import { lockActiveConsentId } from "./consent-gate";

const listSingleChapterRenders = (database: Database) =>
  database
    .select({
      renderId: renders.id,
      userId: renders.userId,
      voiceId: renders.voiceProfileId,
      storyId: renders.storyId,
      storyVersion: renders.storyVersion,
      chapterId: renderChapters.id,
      storageKey: renderChapters.storageKey,
    })
    .from(renders)
    .innerJoin(renderChapters, eq(renderChapters.renderId, renders.id))
    .where(and(eq(renders.status, "succeeded"), eq(renders.chaptersTotal, 1)));

// 게시(render-repo completeUnderLock)처럼 동의를 잠그고 쓴다. 옛 장을 지운 행이 있을 때만 바꾼다.
const replaceUnderLock = async (database: Database, render: SingleChapterRender, chapters: readonly FinishedChapter[]): Promise<ChapterReplacement> => {
  if ((await lockActiveConsentId(database, render.voiceId, render.userId)) === null) return "no_active_consent";
  const { renderId, chapterId } = render;
  const removed = await database
    .delete(renderChapters)
    .where(and(eq(renderChapters.id, chapterId), eq(renderChapters.renderId, renderId)))
    .returning({ id: renderChapters.id });
  if (removed.length !== 1) return "render_changed";
  await database.insert(renderChapters).values(chapters.map((chapter) => ({ renderId, ...chapter })));
  await database.update(renders).set({ chaptersTotal: chapters.length, chaptersDone: chapters.length }).where(eq(renders.id, renderId));
  return "replaced";
};

export const createChapterizeRepo = (database: Database): ChapterizeRepo => ({
  listSingleChapterRenders: () => listSingleChapterRenders(database),
  replaceChapter: (render, chapters) => database.transaction((transaction) => replaceUnderLock(transaction, render, chapters)),
});
