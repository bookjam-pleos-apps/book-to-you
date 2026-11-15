import { and, eq, inArray, ne } from "drizzle-orm";

import type { LiveConsentStatus, VoiceChangeOutcome, VoiceRecord, VoiceRepo } from "../../../application/voices/ports";
import { isEmptyVoiceChange, judgeVoiceChange, type VoiceChange } from "../../../domain/voices/voice-change";
import type { Database } from "../client";
import { consentRecords, users, voiceClips, voiceProfiles } from "../schema";
import { lockOwnedVoice } from "./consent-gate";

type VoiceRow = { readonly id: string; readonly label: string; readonly isDefault: boolean };

const isLive = (status: "checking" | "active" | "revoked"): status is LiveConsentStatus => status !== "revoked";

const consentsOf = (database: Database, voiceIds: readonly string[]) =>
  database
    .select({ voiceId: consentRecords.voiceProfileId, status: consentRecords.status })
    .from(consentRecords)
    .where(and(inArray(consentRecords.voiceProfileId, [...voiceIds]), eq(consentRecords.kind, "speaker_voice")));

const clipsOf = (database: Database, voiceIds: readonly string[]) =>
  database
    .select({ id: voiceClips.id, voiceId: voiceClips.voiceProfileId, style: voiceClips.style, status: voiceClips.status, failure: voiceClips.failure, advice: voiceClips.advice })
    .from(voiceClips)
    .where(inArray(voiceClips.voiceProfileId, [...voiceIds]));

const toRecords = async (database: Database, rows: readonly VoiceRow[]): Promise<readonly VoiceRecord[]> => {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [consents, clips] = await Promise.all([consentsOf(database, ids), clipsOf(database, ids)]);
  return rows.map((row) => {
    const statuses = consents.filter((consent) => consent.voiceId === row.id).map((consent) => consent.status);
    const live = statuses.find(isLive) ?? null;
    return {
      ...row,
      consent: live,
      // 철회는 음성을 함께 지우므로, 음성이 남아 있는데 revoked면 낭독 확인에서 탈락한 것이다.
      consentRejected: live === null && statuses.length > 0,
      clips: clips.filter((clip) => clip.voiceId === row.id).map(({ id, style, status: clipStatus, failure, advice }) => ({ id, style, status: clipStatus, failure, advice })),
    };
  });
};

const voiceColumns = { id: voiceProfiles.id, label: voiceProfiles.label, isDefault: voiceProfiles.isDefault };

const findOwned = async (database: Database, voiceId: string, userId: string): Promise<VoiceRecord | null> => {
  const rows = await database
    .select(voiceColumns)
    .from(voiceProfiles)
    .where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId)));
  const [record] = await toRecords(database, rows);
  return record ?? null;
};

const clearOtherDefaults = (database: Database, voiceId: string, userId: string) =>
  database
    .update(voiceProfiles)
    .set({ isDefault: false })
    .where(and(eq(voiceProfiles.userId, userId), eq(voiceProfiles.isDefault, true), ne(voiceProfiles.id, voiceId)));

const writeChange = async (database: Database, voiceId: string, userId: string, change: VoiceChange): Promise<void> => {
  if (isEmptyVoiceChange(change)) return;
  if (change.isDefault === true) await clearOtherDefaults(database, voiceId, userId);
  await database
    .update(voiceProfiles)
    .set({ label: change.label, isDefault: change.isDefault })
    .where(eq(voiceProfiles.id, voiceId));
};

// 잠금 순서는 사용자 → 음성이다(deletion-repo). 사용자 행을 먼저 잠가 대표 지정 두 건이 동시에 unique 위반을 내지 않게 한다.
// 바뀐 목소리는 같은 트랜잭션에서 읽어, 커밋 뒤 삭제와 겹쳐도 방금 쓴 값을 돌려준다.
const applyChangeInTransaction = async (
  database: Database,
  voiceId: string,
  userId: string,
  change: VoiceChange,
): Promise<VoiceChangeOutcome> => {
  await database.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("no key update");
  const voice = await lockOwnedVoice(database, voiceId, userId);
  if (voice === null) return { kind: "not_found" };
  const verdict = judgeVoiceChange(change, voice.hasActiveConsent);
  if (verdict !== "allowed") return { kind: verdict };
  await writeChange(database, voiceId, userId, change);
  const updated = await findOwned(database, voiceId, userId);
  return updated === null ? { kind: "not_found" } : { kind: "updated", voice: updated };
};

export const createVoiceRepo = (database: Database): VoiceRepo => ({
  create: async (userId, label) => {
    const [created] = await database.insert(voiceProfiles).values({ userId, label }).returning({ id: voiceProfiles.id });
    if (created === undefined) throw new Error("voice not inserted");
    return created.id;
  },
  list: async (userId) => {
    const rows = await database.select(voiceColumns).from(voiceProfiles).where(eq(voiceProfiles.userId, userId));
    return toRecords(database, rows);
  },
  find: (voiceId, userId) => findOwned(database, voiceId, userId),
  applyChange: (voiceId, userId, change) =>
    database.transaction((transaction) => applyChangeInTransaction(transaction, voiceId, userId, change)),
});
