import { STYLES } from "@voice-storybook/shared/vocab";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { openTestDatabase, type TestDatabase } from "../testing/open-test-database";
import { consentRecords, pendingPurges, renderChapters, renders, users, voiceClips, voiceProfiles } from "./index";

const seedVoice = async (database: TestDatabase) => {
  const [user] = await database.insert(users).values({ email: "parent@example.com" }).returning();
  if (!user) throw new Error("user not inserted");
  const [consent] = await database
    .insert(consentRecords)
    .values({
      kind: "speaker_voice",
      userId: user.id,
      termsVersion: "1",
      aiNoticeVersion: "1",
      status: "active",
      givenAt: new Date(),
    })
    .returning();
  if (!consent) throw new Error("consent not inserted");
  const [voice] = await database
    .insert(voiceProfiles)
    .values({ userId: user.id, label: "엄마", activeConsentId: consent.id })
    .returning();
  if (!voice) throw new Error("voice not inserted");
  return { user, consent, voice };
};

const renderValues = (seed: Awaited<ReturnType<typeof seedVoice>>) => ({
  userId: seed.user.id,
  voiceProfileId: seed.voice.id,
  storyId: "toto",
  storyVersion: "v1",
  renderKey: "same-key",
  refClipIds: [],
  engineId: "fake",
  engineVersion: "1",
  chaptersTotal: 1,
});

describe("schema", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await openTestDatabase();
  });

  it("removes voices, clips, renders and chapters with the account", async () => {
    const seed = await seedVoice(database);
    await database.insert(voiceClips).values({
      voiceProfileId: seed.voice.id,
      consentId: seed.consent.id,
      style: "calm",
      scriptId: "calm",
      scriptVersion: "1",
      storageKey: "u/x/v/y/calm.wav",
      sha256: "a",
      durationMs: 1000,
    });
    const [render] = await database.insert(renders).values(renderValues(seed)).returning();
    if (!render) throw new Error("render not inserted");
    await database.insert(renderChapters).values({
      renderId: render.id,
      index: 0,
      role: "intro",
      storageKey: "u/x/r/0.m4a",
      durationMs: 1000,
      bytes: 10,
      sha256: "b",
    });

    await database.delete(users);

    expect(await database.select().from(voiceProfiles)).toEqual([]);
    expect(await database.select().from(voiceClips)).toEqual([]);
    expect(await database.select().from(renders)).toEqual([]);
    expect(await database.select().from(renderChapters)).toEqual([]);
  });

  it("keeps the consent receipt after the account is deleted", async () => {
    const seed = await seedVoice(database);
    await database.delete(users);
    const [receipt] = await database.select().from(consentRecords);
    expect(receipt?.id).toBe(seed.consent.id);
    expect(receipt?.userId).toBeNull();
  });

  it("requires an explicit consent status so a forgotten value never activates consent", async () => {
    const insert = database.execute(
      sql`INSERT INTO consent_records (kind, terms_version, ai_notice_version, given_at)
          VALUES ('speaker_voice', '1', '1', now())`,
    );
    await expect(insert).rejects.toThrow();
  });

  it("allows only one live consent per voice but a new one after revocation", async () => {
    const consent = {
      kind: "speaker_voice" as const,
      voiceProfileId: "00000000-0000-4000-8000-000000000001",
      termsVersion: "1",
      aiNoticeVersion: "1",
      givenAt: new Date(),
    };
    await database.insert(consentRecords).values({ ...consent, status: "checking" });
    await expect(database.insert(consentRecords).values({ ...consent, status: "active" })).rejects.toThrow();
    await database.update(consentRecords).set({ status: "revoked" });
    await expect(database.insert(consentRecords).values({ ...consent, status: "checking" })).resolves.toBeDefined();
  });

  it("keeps a purge request after the account is gone", async () => {
    await seedVoice(database);
    await database.insert(pendingPurges).values({ storagePrefix: "u/x/", engineKeys: ["key"] });
    await database.delete(users);
    expect(await database.select().from(pendingPurges)).toHaveLength(1);
  });

  it("has a style enum value for every style in the shared vocabulary", async () => {
    const result = await database.execute(sql`SELECT unnest(enum_range(NULL::style))::text AS style`);
    expect(result.rows.map((row) => row["style"])).toEqual([...STYLES]);
  });

  it("allows only one default voice per account", async () => {
    const seed = await seedVoice(database);
    await database.update(voiceProfiles).set({ isDefault: true });
    const second = database.insert(voiceProfiles).values({ userId: seed.user.id, label: "아빠", isDefault: true });
    await expect(second).rejects.toThrow();
  });

  it("rejects a second live render with the same key", async () => {
    const seed = await seedVoice(database);
    await database.insert(renders).values(renderValues(seed));
    await expect(database.insert(renders).values(renderValues(seed))).rejects.toThrow();
  });

  it("allows retrying a key whose previous render failed", async () => {
    const seed = await seedVoice(database);
    await database.insert(renders).values({ ...renderValues(seed), status: "failed" });
    await expect(database.insert(renders).values(renderValues(seed))).resolves.toBeDefined();
  });

  it("rejects a duplicate chapter index so retries must upsert", async () => {
    const seed = await seedVoice(database);
    const [render] = await database.insert(renders).values(renderValues(seed)).returning();
    if (!render) throw new Error("render not inserted");
    const chapter = {
      renderId: render.id,
      index: 0,
      role: "intro" as const,
      storageKey: "k",
      durationMs: 1,
      bytes: 1,
      sha256: "c",
    };
    await database.insert(renderChapters).values(chapter);
    await expect(database.insert(renderChapters).values(chapter)).rejects.toThrow();
  });
});
