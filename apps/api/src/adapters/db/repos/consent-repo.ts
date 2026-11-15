import { and, eq, ne } from "drizzle-orm";

import type { ConsentAwaitingCheck, ConsentCheckRepo } from "../../../application/verification/ports";
import type { ConsentInsertion, ConsentRepo, NewConsent } from "../../../application/voices/ports";
import type { Database } from "../client";
import { consentRecords, users, voiceProfiles } from "../schema";
import { hasActiveConsent } from "./consent-gate";

// 삭제와 같은 순서(사용자 → 음성)로 잠근다. INSERT의 FK 검사도 사용자 행을 잠가, 음성부터 잡으면 교착이 생긴다.
const insertUnderLock = async (database: Database, { voiceId, ...consent }: NewConsent): Promise<ConsentInsertion> => {
  const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.id, consent.userId)).for("key share");
  if (owner === undefined) return "voice_gone";
  const [voice] = await database
    .select({ id: voiceProfiles.id })
    .from(voiceProfiles)
    .where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, consent.userId)))
    .for("update");
  if (voice === undefined) return "voice_gone";
  const live = await database
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.voiceProfileId, voiceId),
        eq(consentRecords.kind, "speaker_voice"),
        ne(consentRecords.status, "revoked"),
      ),
    );
  if (live.length > 0) return "already_live";
  await database
    .insert(consentRecords)
    .values({ ...consent, voiceProfileId: voiceId, kind: "speaker_voice", status: "checking" });
  return "inserted";
};

// 삭제 경로와 같은 순서(음성 → 동의)로 잠근다. 순서가 다르면 교착이 생긴다.
const activateUnderTransaction = async (database: Database, consentId: string, matchScore: number | null): Promise<boolean> => {
  const [target] = await database
    .select({ voiceId: consentRecords.voiceProfileId })
    .from(consentRecords)
    .where(eq(consentRecords.id, consentId));
  if (target?.voiceId == null) return false;
  const [voice] = await database
    .select({ id: voiceProfiles.id })
    .from(voiceProfiles)
    .where(eq(voiceProfiles.id, target.voiceId))
    .for("update");
  if (voice === undefined) return false;
  const activated = await database
    .update(consentRecords)
    .set({ status: "active", matchScore })
    .where(and(eq(consentRecords.id, consentId), eq(consentRecords.status, "checking")))
    .returning({ id: consentRecords.id });
  if (activated.length !== 1) return false;
  await database.update(voiceProfiles).set({ activeConsentId: consentId }).where(eq(voiceProfiles.id, voice.id));
  return true;
};

const findChecking = async (database: Database, consentId: string): Promise<ConsentAwaitingCheck | null> => {
  const [row] = await database
    .select({ userId: consentRecords.userId, voiceId: consentRecords.voiceProfileId, phrase: consentRecords.phrase })
    .from(consentRecords)
    .where(and(eq(consentRecords.id, consentId), eq(consentRecords.status, "checking")));
  if (row?.userId == null || row.voiceId === null || row.phrase === null) return null;
  return { userId: row.userId, voiceId: row.voiceId, phrase: row.phrase };
};

export const createConsentRepo = (database: Database): ConsentRepo & ConsentCheckRepo => ({
  hasActive: (voiceId, userId) => hasActiveConsent(database, voiceId, userId),
  findChecking: (consentId) => findChecking(database, consentId),
  reject: async (consentId, now) => {
    const rejected = await database
      .update(consentRecords)
      .set({ status: "revoked", revokedAt: now })
      .where(and(eq(consentRecords.id, consentId), eq(consentRecords.status, "checking")))
      .returning({ id: consentRecords.id });
    return rejected.length === 1;
  },
  insertChecking: (consent) => database.transaction((transaction) => insertUnderLock(transaction, consent)),
  activate: (consentId, matchScore) =>
    database.transaction((transaction) => activateUnderTransaction(transaction, consentId, matchScore)),
});
