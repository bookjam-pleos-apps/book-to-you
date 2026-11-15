import { randomUUID } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase } from "../client";
import { consentRecords, users, voiceClips, voiceProfiles } from "../schema";
import { createClipRepo } from "./clip-repo";
import { createConsentRepo } from "./consent-repo";

const connection = connectDatabase(process.env.DATABASE_URL ?? "");
const { database } = connection;

const seedVoice = async () => {
  const unique = randomUUID();
  const [user] = await database.insert(users).values({ email: `${unique}@example.com` }).returning();
  if (!user) throw new Error("user not inserted");
  const [voice] = await database.insert(voiceProfiles).values({ userId: user.id, label: "엄마" }).returning();
  if (!voice) throw new Error("voice not inserted");
  return { userId: user.id, voiceId: voice.id };
};

const newConsent = (userId: string, voiceId: string) => ({
  id: randomUUID(),
  userId,
  voiceId,
  speakerLabel: "엄마",
  termsVersion: "1",
  aiNoticeVersion: "1",
  phrase: "문구",
  phraseAudioSha256: "a",
  givenAt: new Date(),
});

describe("consent gate under real concurrency", () => {
  beforeAll(() => connection.migrate());
  afterAll(() => connection.close());

  it("keeps one live consent when submissions race", async () => {
    const { userId, voiceId } = await seedVoice();
    const repo = createConsentRepo(database);
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.insertChecking(newConsent(userId, voiceId))));
    expect(results.filter((result) => result === "inserted")).toHaveLength(1);
    const live = await database
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.voiceProfileId, voiceId), ne(consentRecords.status, "revoked")));
    expect(live).toHaveLength(1);
  });

  it("does not insert a clip while the gate is closed by a concurrent revocation", async () => {
    const { userId, voiceId } = await seedVoice();
    const consents = createConsentRepo(database);
    const consent = newConsent(userId, voiceId);
    await consents.insertChecking(consent);
    await consents.activate(consent.id, 1);
    const clips = createClipRepo(database);
    const clip = (id: string) => ({
      id,
      userId,
      voiceId,
      style: "calm" as const,
      scriptId: "calm",
      scriptVersion: "1",
      storageKey: `k/${id}`,
      sha256: "a",
      durationMs: 1,
      signal: { clippedRatio: 0, noiseFloorDb: -60, peakDb: -6 },
    });
    const [inserted, , revokedAfter] = await Promise.all([
      clips.insertIfConsentActive(clip(randomUUID())),
      database.update(voiceProfiles).set({ activeConsentId: null }).where(eq(voiceProfiles.id, voiceId)),
      clips.insertIfConsentActive(clip(randomUUID())),
    ]);
    const stored = await database.select().from(voiceClips).where(eq(voiceClips.voiceProfileId, voiceId));
    expect(stored.length).toBe([inserted, revokedAfter].filter(Boolean).length);
    expect(await clips.insertIfConsentActive(clip(randomUUID()))).toBe(false);
  });
});
