import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteVoice } from "../../application/voices";
import { voicePrefix } from "../../domain/storage-keys";
import { wireRetention } from "../../wiring/retention";
import { connectDatabase } from "../db/client";
import { createConsentRepo } from "../db/repos/consent-repo";
import { createDeletionRepo } from "../db/repos/deletion-repo";
import { consentRecords, pendingPurges, users, voiceClips, voiceHandles, voiceProfiles } from "../db/schema";
import { createS3Storage, ensureBucket } from "../storage/s3-storage";
import { startProducer, startWorker, type BossRuntime } from "./pg-boss-queue";

const URL = process.env.DATABASE_URL ?? "";
const storageOptions = {
  endpoint: process.env.S3_ENDPOINT ?? "",
  bucket: process.env.S3_BUCKET ?? "",
  accessKeyId: process.env.MINIO_ROOT_USER ?? "",
  secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "",
};

const connection = connectDatabase(URL);
const { database } = connection;
const storage = createS3Storage(storageOptions);
const purgedKeys: string[] = [];
const clock = () => new Date();

const waitUntil = async (check: () => Promise<boolean>, attemptsLeft = 40): Promise<void> => {
  if (await check()) return;
  if (attemptsLeft === 0) throw new Error("condition not met in time");
  await new Promise((resolve) => setTimeout(resolve, 500));
  return waitUntil(check, attemptsLeft - 1);
};

const seedVoiceWithObjects = async () => {
  const [user] = await database.insert(users).values({ email: `${randomUUID()}@example.com` }).returning();
  if (!user) throw new Error("user not inserted");
  const [voice] = await database.insert(voiceProfiles).values({ userId: user.id, label: "엄마" }).returning();
  if (!voice) throw new Error("voice not inserted");
  const consent = {
    id: randomUUID(),
    userId: user.id,
    voiceId: voice.id,
    speakerLabel: "엄마",
    termsVersion: "1",
    aiNoticeVersion: "1",
    phrase: "문구",
    phraseAudioSha256: "a",
    givenAt: new Date(),
  };
  const consents = createConsentRepo(database);
  await consents.insertChecking(consent);
  await consents.activate(consent.id, 1);
  const prefix = voicePrefix(user.id, voice.id);
  const storageKey = `${prefix}clips/a.wav`;
  await storage.put(storageKey, new TextEncoder().encode("voice"), "audio/wav");
  const [clip] = await database
    .insert(voiceClips)
    .values({
      voiceProfileId: voice.id,
      consentId: consent.id,
      style: "calm",
      scriptId: "calm",
      scriptVersion: "1",
      storageKey,
      sha256: "a",
      durationMs: 1,
    })
    .returning();
  if (!clip) throw new Error("clip not inserted");
  const handleKey = `handle-${randomUUID()}`;
  await database.insert(voiceHandles).values({ clipId: clip.id, engineId: "fake", modelRev: "1", key: handleKey });
  return { userId: user.id, voiceId: voice.id, consentId: consent.id, prefix, handleKey };
};

describe("deletion through real pg-boss and MinIO", () => {
  let producer: BossRuntime;
  let worker: { readonly stop: () => Promise<void> };

  beforeAll(async () => {
    await connection.migrate();
    await ensureBucket(storageOptions);
    worker = await startWorker(URL, (queue) =>
      wireRetention({
        database,
        storage,
        queue,
        clock,
        engine: { purge: async (keys) => void purgedKeys.push(...keys) },
      }),
    );
    producer = await startProducer(URL);
  });

  afterAll(async () => {
    await producer.stop();
    await worker.stop();
    await connection.close();
  });

  it("leaves no object, handle or pending row after a voice is deleted", async () => {
    const seeded = await seedVoiceWithObjects();
    const remove = deleteVoice({ deletion: createDeletionRepo(database), queue: producer.queue, clock });
    expect(await remove(seeded.voiceId, seeded.userId)).toBe(true);
    await waitUntil(async () => (await storage.list(seeded.prefix)).length === 0);
    await waitUntil(async () => purgedKeys.includes(seeded.handleKey));
    await waitUntil(async () => (await database.select().from(pendingPurges)).length === 0);
    const [receipt] = await database.select().from(consentRecords).where(eq(consentRecords.id, seeded.consentId));
    expect(receipt?.status).toBe("revoked");
  });
});
