import { and, eq } from "drizzle-orm";

import type { Database } from "../client";
import { consentRecords, users, voiceProfiles } from "../schema";

// 활성 동의의 조건은 이것 하나다. 경로마다 다른 조건을 쓰면 철회가 새어 나간다.
export const activeConsentOfVoice = and(
  eq(consentRecords.id, voiceProfiles.activeConsentId),
  eq(consentRecords.status, "active"),
);

const selectActiveConsentId = (database: Database, voiceId: string, userId: string) =>
  database
    .select({ consentId: consentRecords.id })
    .from(voiceProfiles)
    .innerJoin(consentRecords, activeConsentOfVoice)
    .where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId)));

export const hasActiveConsent = async (database: Database, voiceId: string, userId: string): Promise<boolean> =>
  (await selectActiveConsentId(database, voiceId, userId)).length === 1;

// 음성 행을 잠가 판단과 삽입 사이에 삭제나 철회가 끼어들지 못하게 한다.
export const lockActiveConsentId = async (database: Database, voiceId: string, userId: string): Promise<string | null> => {
  const [gate] = await selectActiveConsentId(database, voiceId, userId).for("update", { of: voiceProfiles });
  return gate?.consentId ?? null;
};

// 렌더 행을 만들거나 가져가기 전에 잡는다. 삭제와 같은 순서(사용자 → 음성)라 교착이 없고,
// renders의 user_id FK 검사도 사용자 행을 잠그므로 음성부터 잡으면 안 된다. 사용자나 활성 동의가 없으면 false.
export const lockOwnerAndActiveConsent = async (database: Database, voiceId: string, userId: string): Promise<boolean> => {
  const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("key share");
  if (owner === undefined) return false;
  return (await lockActiveConsentId(database, voiceId, userId)) !== null;
};

export type OwnedVoiceLock = { readonly hasActiveConsent: boolean };

// lockActiveConsentId와 달리 동의가 없어도 음성 행을 잠근다. 녹음 중인 목소리도 이름을 바꿀 수 있어야 한다.
export const lockOwnedVoice = async (database: Database, voiceId: string, userId: string): Promise<OwnedVoiceLock | null> => {
  const [row] = await database
    .select({ consentId: consentRecords.id })
    .from(voiceProfiles)
    .leftJoin(consentRecords, activeConsentOfVoice)
    .where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId)))
    .for("update", { of: voiceProfiles });
  return row === undefined ? null : { hasActiveConsent: row.consentId !== null };
};
