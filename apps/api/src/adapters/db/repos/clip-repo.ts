import type { ClipAdvice, Style } from "@voice-storybook/shared/vocab";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";

import type { AnchorClip, ClipAwaitingCheck, ClipCheckRepo, ClipReading, ClipVerdict } from "../../../application/verification/ports";
import type { ClipRepo, NewClip } from "../../../application/voices/ports";
import { mapInSequence } from "../../../domain/in-sequence";
import { ANCHOR_STYLE } from "../../../domain/voices/style-check";
import type { Database } from "../client";
import { voiceClips, voiceProfiles } from "../schema";
import { removeClip } from "./clip-removal";
import { lockActiveConsentId } from "./consent-gate";

const prosodySchema = z.object({ medianSemitones: z.number().nullable(), speechRate: z.number().nullable() });

const insertUnderLock = async (database: Database, { userId, voiceId, ...clip }: NewClip): Promise<boolean> => {
  const consentId = await lockActiveConsentId(database, voiceId, userId);
  if (consentId === null) return false;
  await database.insert(voiceClips).values({ ...clip, voiceProfileId: voiceId, consentId });
  return true;
};

const isChecking = (clipId: string) => and(eq(voiceClips.id, clipId), eq(voiceClips.status, "checking"));

const readingOf = (cer: number | null, prosody: unknown): ClipReading | null =>
  cer === null || prosody === null ? null : { errorRate: cer, prosody: prosodySchema.parse(prosody) };

const checkingColumns = {
  voiceId: voiceClips.voiceProfileId,
  style: voiceClips.style,
  storageKey: voiceClips.storageKey,
  scriptId: voiceClips.scriptId,
  scriptVersion: voiceClips.scriptVersion,
  cer: voiceClips.cer,
  prosody: voiceClips.prosody,
};

const anchorColumns = {
  id: voiceClips.id,
  storageKey: voiceClips.storageKey,
  scriptId: voiceClips.scriptId,
  scriptVersion: voiceClips.scriptVersion,
  prosody: voiceClips.prosody,
};

const ofVoice = (voiceId: string, status: "checking" | "passed") =>
  and(eq(voiceClips.voiceProfileId, voiceId), eq(voiceClips.status, status));

const findChecking = async (database: Database, clipId: string): Promise<ClipAwaitingCheck | null> => {
  const [row] = await database.select(checkingColumns).from(voiceClips).where(isChecking(clipId));
  if (row === undefined) return null;
  const { cer, prosody, ...clip } = row;
  return { ...clip, reading: readingOf(cer, prosody) };
};

// 같은 음성의 확정을 한 줄로 세운다. 다시 읽은 녹음 둘이 함께 확정되어도 통과 녹음이 둘 남지 않는다.
const lockVoiceOfClip = (database: Database, clipId: string) =>
  database
    .select({ id: voiceProfiles.id })
    .from(voiceProfiles)
    .innerJoin(voiceClips, eq(voiceClips.voiceProfileId, voiceProfiles.id))
    .where(eq(voiceClips.id, clipId))
    .for("update", { of: voiceProfiles });

type SettledClip = { readonly id: string; readonly voiceId: string; readonly style: Style };

// 같은 style에 통과 녹음이 둘이면 렌더가 참조를 고르지 못한다(ambiguous_clip). 둘 중 하나라도 코칭이 붙었으면 새 녹음이 앞선 녹음을 대신한다.
// 코칭 없는 통과 녹음끼리는 건드리지 않는다. 운영자가 --clip으로 고르는 기존 규칙이다.
const removeReplacedTakes = async (database: Database, { id, voiceId, style }: SettledClip, advice: ClipAdvice | null): Promise<void> => {
  const replaced = advice === null ? isNotNull(voiceClips.advice) : undefined;
  const takes = await database
    .select({ id: voiceClips.id, storageKey: voiceClips.storageKey })
    .from(voiceClips)
    .where(and(ofVoice(voiceId, "passed"), eq(voiceClips.style, style), ne(voiceClips.id, id), replaced));
  await mapInSequence(takes, (take) => removeClip(database, take.id, take.storageKey));
};

const settle = async (database: Database, clipId: string, verdict: ClipVerdict): Promise<boolean> => {
  const { status, errorRate, prosody, failure, advice } = verdict;
  await lockVoiceOfClip(database, clipId);
  const [settled] = await database
    .update(voiceClips)
    .set({ status, cer: errorRate, prosody, failure, advice })
    .where(isChecking(clipId))
    .returning({ id: voiceClips.id, voiceId: voiceClips.voiceProfileId, style: voiceClips.style });
  if (settled === undefined) return false;
  if (status === "passed") await removeReplacedTakes(database, settled, advice);
  return true;
};

const passedAnchors = async (database: Database, voiceId: string): Promise<readonly AnchorClip[]> => {
  const rows = await database
    .select(anchorColumns)
    .from(voiceClips)
    .where(and(ofVoice(voiceId, "passed"), eq(voiceClips.style, ANCHOR_STYLE)));
  return rows.map(({ prosody, ...clip }) => ({ ...clip, prosody: prosodySchema.nullable().parse(prosody) }));
};

// 측정값이 남아 있는 checking 녹음이다. 대본은 통과했고 기준점을 기다린다.
const idsAwaitingAnchor = async (database: Database, voiceId: string): Promise<readonly string[]> => {
  const rows = await database
    .select({ id: voiceClips.id })
    .from(voiceClips)
    .where(and(ofVoice(voiceId, "checking"), isNotNull(voiceClips.prosody), isNotNull(voiceClips.cer)));
  return rows.map(({ id }) => id);
};

export const createClipRepo = (database: Database): ClipRepo & ClipCheckRepo => ({
  insertIfConsentActive: (clip) => database.transaction((transaction) => insertUnderLock(transaction, clip)),
  findChecking: (clipId) => findChecking(database, clipId),
  settle: (clipId, verdict) => database.transaction((transaction) => settle(transaction, clipId, verdict)),
  recordReading: async (clipId, { errorRate, prosody }) => {
    await database.update(voiceClips).set({ cer: errorRate, prosody }).where(isChecking(clipId));
  },
  recordProsody: async (clipId, prosody) => {
    await database.update(voiceClips).set({ prosody }).where(eq(voiceClips.id, clipId));
  },
  passedAnchors: (voiceId) => passedAnchors(database, voiceId),
  idsAwaitingAnchor: (voiceId) => idsAwaitingAnchor(database, voiceId),
});
