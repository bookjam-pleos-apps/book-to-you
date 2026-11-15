import { and, eq, inArray, lt, ne } from "drizzle-orm";

import type { PurgeRepo, RetentionRepo } from "../../../application/retention/ports";
import { consentIdOfKey } from "../../../domain/storage-keys";
import type { Database } from "../client";
import { consentRecords, devicePairings, otpCodes, pendingPurges, renderChapters, sessions, voiceClips, voicePrompts } from "../schema";

const keysInColumn = async (database: Database, keys: readonly string[]) => {
  const list = [...keys];
  const [clips, chapters, prompts] = await Promise.all([
    // 탈락한 클립의 객체는 쓰이지 않는다. verify의 삭제가 실패해도 고아 정리가 지우도록 참조에서 뺀다.
    database
      .select({ key: voiceClips.storageKey })
      .from(voiceClips)
      .where(and(inArray(voiceClips.storageKey, list), ne(voiceClips.status, "failed"))),
    database.select({ key: renderChapters.storageKey }).from(renderChapters).where(inArray(renderChapters.storageKey, list)),
    database.select({ key: voicePrompts.storageKey }).from(voicePrompts).where(inArray(voicePrompts.storageKey, list)),
  ]);
  return [...clips, ...chapters, ...prompts].map((row) => row.key);
};

// 확인을 기다리는 낭독은 verify 작업이 읽어야 하므로 지우지 않는다.
const consentAudioAwaitingVerify = async (database: Database, keys: readonly string[]) => {
  const byConsent = keys.flatMap((key) => {
    const consentId = consentIdOfKey(key);
    return consentId === null ? [] : [{ key, consentId }];
  });
  if (byConsent.length === 0) return [];
  const checking = await database
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(inArray(consentRecords.id, byConsent.map((item) => item.consentId)), eq(consentRecords.status, "checking")));
  return byConsent.filter((item) => checking.some((row) => row.id === item.consentId)).map((item) => item.key);
};

const listChecking = async (database: Database) => {
  const [clips, consents] = await Promise.all([
    database.select({ id: voiceClips.id }).from(voiceClips).where(eq(voiceClips.status, "checking")),
    database
      .select({ id: consentRecords.id })
      .from(consentRecords)
      .where(and(eq(consentRecords.kind, "speaker_voice"), eq(consentRecords.status, "checking"))),
  ]);
  return { clipIds: clips.map((clip) => clip.id), consentIds: consents.map((consent) => consent.id) };
};

export const createRetentionRepo = (database: Database): RetentionRepo => ({
  listChecking: () => listChecking(database),
  findReferencedKeys: async (keys) => {
    if (keys.length === 0) return new Set();
    const [stored, awaiting] = await Promise.all([keysInColumn(database, keys), consentAudioAwaitingVerify(database, keys)]);
    return new Set([...stored, ...awaiting]);
  },
  deleteExpiredAuthRows: async (now, otpCreatedBefore) => {
    await database.delete(otpCodes).where(lt(otpCodes.createdAt, otpCreatedBefore));
    await database.delete(sessions).where(lt(sessions.expiresAt, now));
    await database.delete(devicePairings).where(lt(devicePairings.expiresAt, now));
  },
});

export const createPurgeRepo = (database: Database): PurgeRepo => ({
  listPending: () =>
    database
      .select({ id: pendingPurges.id, storagePrefix: pendingPurges.storagePrefix, engineKeys: pendingPurges.engineKeys })
      .from(pendingPurges),
  markDone: async (id) => {
    await database.delete(pendingPurges).where(eq(pendingPurges.id, id));
  },
});
