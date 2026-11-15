import { and, eq, inArray, ne } from "drizzle-orm";

import type { AccountDeletionRepo } from "../../../application/identity/ports";
import type { VoiceDeletionRepo } from "../../../application/voices/ports";
import { userPrefix, voicePrefix } from "../../../domain/storage-keys";
import type { Database } from "../client";
import { consentRecords, otpCodes, pendingPurges, users, voiceClips, voiceHandles, voiceProfiles } from "../schema";
import { removeClip } from "./clip-removal";

// 잠금 순서는 사용자 → 음성 → 동의다. 동의 제출과 활성화도 이 순서를 지킨다(lock-order.int.ts).
const lockVoicesOfUser = (database: Database, userId: string) =>
  database.select({ id: voiceProfiles.id }).from(voiceProfiles).where(eq(voiceProfiles.userId, userId)).for("update");

const handleKeysOfVoices = async (database: Database, voiceIds: readonly string[]): Promise<readonly string[]> => {
  if (voiceIds.length === 0) return [];
  const rows = await database
    .select({ key: voiceHandles.key })
    .from(voiceHandles)
    .innerJoin(voiceClips, eq(voiceClips.id, voiceHandles.clipId))
    .where(inArray(voiceClips.voiceProfileId, [...voiceIds]));
  return rows.map((row) => row.key);
};

const revokeConsents = async (database: Database, owner: ReturnType<typeof eq>, now: Date): Promise<void> => {
  await database
    .update(consentRecords)
    .set({ status: "revoked", revokedAt: now })
    .where(and(owner, ne(consentRecords.status, "revoked")));
};

const deleteAccountInTransaction = async (database: Database, userId: string, now: Date): Promise<boolean> => {
  const [user] = await database.select().from(users).where(eq(users.id, userId)).for("update");
  if (user === undefined) return false;
  const voices = await lockVoicesOfUser(database, userId);
  const engineKeys = await handleKeysOfVoices(database, voices.map((voice) => voice.id));
  await revokeConsents(database, eq(consentRecords.userId, userId), now);
  await database.insert(pendingPurges).values({ storagePrefix: userPrefix(userId), engineKeys: [...engineKeys] });
  await database.delete(otpCodes).where(eq(otpCodes.email, user.email));
  await database.delete(users).where(eq(users.id, userId));
  return true;
};

const deleteVoiceInTransaction = async (database: Database, voiceId: string, userId: string, now: Date): Promise<boolean> => {
  const [voice] = await database
    .select({ id: voiceProfiles.id })
    .from(voiceProfiles)
    .where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId)))
    .for("update");
  if (voice === undefined) return false;
  const engineKeys = await handleKeysOfVoices(database, [voiceId]);
  await revokeConsents(database, eq(consentRecords.voiceProfileId, voiceId), now);
  await database.insert(pendingPurges).values({ storagePrefix: voicePrefix(userId, voiceId), engineKeys: [...engineKeys] });
  await database.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
  return true;
};

const deleteClipInTransaction = async (database: Database, clipId: string, voiceId: string, userId: string): Promise<boolean> => {
  const [clip] = await database
    .select({ storageKey: voiceClips.storageKey })
    .from(voiceClips)
    .innerJoin(voiceProfiles, eq(voiceProfiles.id, voiceClips.voiceProfileId))
    .where(and(eq(voiceClips.id, clipId), eq(voiceClips.voiceProfileId, voiceId), eq(voiceProfiles.userId, userId)))
    .for("update", { of: voiceProfiles });
  if (clip === undefined) return false;
  await removeClip(database, clipId, clip.storageKey);
  return true;
};

export const createDeletionRepo = (database: Database): AccountDeletionRepo & VoiceDeletionRepo => ({
  deleteAccount: (userId, now) => database.transaction((transaction) => deleteAccountInTransaction(transaction, userId, now)),
  deleteVoice: (voiceId, userId, now) =>
    database.transaction((transaction) => deleteVoiceInTransaction(transaction, voiceId, userId, now)),
  deleteClip: (clipId, voiceId, userId) =>
    database.transaction((transaction) => deleteClipInTransaction(transaction, clipId, voiceId, userId)),
});
