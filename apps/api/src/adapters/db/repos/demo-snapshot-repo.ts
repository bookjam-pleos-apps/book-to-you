import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { DemoSnapshotRepo } from "../../../application/demo/ports";
import type { ConsentSnapshot, DemoSnapshot, PromptSnapshot, RenderSnapshot } from "../../../domain/demo/demo-snapshot";
import { latestRenderIds } from "../../../domain/library/latest-render";
import type { Database } from "../client";
import { consentRecords, renderChapters, renders, users, voiceProfiles, voicePrompts } from "../schema";
import { activeConsentOfVoice } from "./consent-gate";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const findActiveVoice = async (database: Database, voiceId: string) => {
  const [row] = await database
    .select({ voice: voiceProfiles, consent: consentRecords })
    .from(voiceProfiles)
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(and(eq(voiceProfiles.id, voiceId), eq(consentRecords.kind, "speaker_voice")));
  return row ?? null;
};

const toConsentSnapshot = (consent: typeof consentRecords.$inferSelect): ConsentSnapshot => ({
  id: consent.id,
  speakerLabel: consent.speakerLabel,
  termsVersion: consent.termsVersion,
  aiNoticeVersion: consent.aiNoticeVersion,
  phrase: consent.phrase,
  phraseAudioSha256: consent.phraseAudioSha256,
  matchScore: consent.matchScore,
  givenAt: consent.givenAt,
});

// 행을 그대로 넘기면 시도 횟수 같은 운영 값까지 묶음 파일에 들어간다. 옮길 열만 고른다.
const toRenderSnapshot = (render: typeof renders.$inferSelect): RenderSnapshot => ({
  id: render.id,
  storyId: render.storyId,
  storyVersion: render.storyVersion,
  renderKey: render.renderKey,
  refClipIds: render.refClipIds,
  engineId: render.engineId,
  engineVersion: render.engineVersion,
  chaptersDone: render.chaptersDone,
  chaptersTotal: render.chaptersTotal,
  startedAt: render.startedAt,
  finishedAt: render.finishedAt,
});

const toPromptSnapshot = ({ id, kind, scriptId, scriptVersion, storageKey, durationMs, bytes, sha256 }: typeof voicePrompts.$inferSelect): PromptSnapshot =>
  ({ id, kind, scriptId, scriptVersion, storageKey, durationMs, bytes, sha256 });

// 차량 책장과 같은 기준이다. 다시 렌더한 이야기는 가장 최근 것만 시연 서버로 옮긴다.
const selectLatestRenders = async (database: Database, voiceId: string) => {
  const rows = await database
    .select()
    .from(renders)
    .where(and(eq(renders.voiceProfileId, voiceId), eq(renders.status, "succeeded")));
  const latest = latestRenderIds(rows.map(({ id, storyId, finishedAt }) => ({ id, voiceId, storyId, finishedAt })));
  return rows.filter((row) => latest.has(row.id));
};

const selectChapters = (database: Database, renderIds: readonly string[]) =>
  renderIds.length === 0
    ? Promise.resolve([])
    : database.select().from(renderChapters).where(inArray(renderChapters.renderId, [...renderIds])).orderBy(asc(renderChapters.index));

// 동의가 다른(이전) 안내 음성은 그 동의를 옮기지 않으므로 함께 옮기지 않는다.
const selectPrompts = (database: Database, voiceId: string, consentId: string) =>
  database
    .select()
    .from(voicePrompts)
    .where(and(eq(voicePrompts.voiceProfileId, voiceId), eq(voicePrompts.consentId, consentId)));

const readVoice = async (database: Database, voiceId: string): Promise<DemoSnapshot | null> => {
  const found = await findActiveVoice(database, voiceId);
  if (found === null) return null;
  const renderRows = await selectLatestRenders(database, voiceId);
  const chapters = await selectChapters(database, renderRows.map((render) => render.id));
  const prompts = await selectPrompts(database, voiceId, found.consent.id);
  return {
    userId: found.voice.userId,
    voice: { id: found.voice.id, label: found.voice.label },
    consent: toConsentSnapshot(found.consent),
    renders: renderRows.map(toRenderSnapshot),
    chapters,
    prompts: prompts.map(toPromptSnapshot),
  };
};

const insertVoiceRows = async (transaction: Transaction, snapshot: DemoSnapshot) => {
  const { userId, voice, consent } = snapshot;
  await transaction
    .insert(consentRecords)
    .values({ ...consent, kind: "speaker_voice", userId, voiceProfileId: voice.id, status: "active" });
  await transaction.insert(voiceProfiles).values({ ...voice, userId, activeConsentId: consent.id });
};

const insertPlayableRows = async (transaction: Transaction, snapshot: DemoSnapshot) => {
  const { userId, voice, consent } = snapshot;
  const renderRows = snapshot.renders.map((render) => ({ ...render, refClipIds: [...render.refClipIds], userId, voiceProfileId: voice.id, status: "succeeded" as const }));
  if (renderRows.length > 0) await transaction.insert(renders).values(renderRows);
  if (snapshot.chapters.length > 0) await transaction.insert(renderChapters).values([...snapshot.chapters]);
  const promptRows = snapshot.prompts.map((prompt) => ({ ...prompt, voiceProfileId: voice.id, consentId: consent.id }));
  if (promptRows.length > 0) await transaction.insert(voicePrompts).values(promptRows);
};

// consent_records.voice_profile_id에는 외래 키가 없어 음성을 지워도 동의가 남는다. 사용자와 음성 양쪽으로 찾아 지운다.
const removeLibrary = async (transaction: Transaction, { userId, voice, consent }: DemoSnapshot) => {
  await transaction.delete(voiceProfiles).where(eq(voiceProfiles.userId, userId));
  const ownedByDemo = or(eq(consentRecords.userId, userId), eq(consentRecords.voiceProfileId, voice.id), eq(consentRecords.id, consent.id));
  await transaction.delete(consentRecords).where(and(eq(consentRecords.kind, "speaker_voice"), ownedByDemo));
};

// 음성 행을 지우면 렌더·챕터·안내 음성이 함께 지워진다. 기기와 세션은 사용자에 붙어 있어 남는다.
const replaceLibrary = (database: Database, snapshot: DemoSnapshot, email: string) =>
  database.transaction(async (transaction) => {
    await transaction.insert(users).values({ id: snapshot.userId, email }).onConflictDoUpdate({ target: users.id, set: { email } });
    await removeLibrary(transaction, snapshot);
    await insertVoiceRows(transaction, snapshot);
    await insertPlayableRows(transaction, snapshot);
  });

export const createDemoSnapshotRepo = (database: Database): DemoSnapshotRepo => ({
  readVoice: (voiceId) => readVoice(database, voiceId),
  replaceLibrary: (snapshot, email) => replaceLibrary(database, snapshot, email),
});
