import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase } from "../client";
import { consentRecords, renders, users, voiceProfiles } from "../schema";
import { createConsentRepo } from "./consent-repo";
import { createDeletionRepo } from "./deletion-repo";
import { createRenderRepo } from "./render-repo";
import { createRenderWorkerRepo } from "./render-worker-repo";
import { createVoiceRepo } from "./voice-repo";

const connection = connectDatabase(process.env.DATABASE_URL ?? "");
const { database } = connection;
const consents = createConsentRepo(database);
const deletion = createDeletionRepo(database);
const renderRepo = createRenderRepo(database);
const voiceRepo = createVoiceRepo(database);
const workerRepo = createRenderWorkerRepo(database);

// 상대가 잠금을 기다리는 상태에 들어갈 시간을 준다.
const LOCK_SETTLE_MS = 200;
const settle = () => new Promise((resolve) => setTimeout(resolve, LOCK_SETTLE_MS));

const seedVoice = async () => {
  const [user] = await database.insert(users).values({ email: `${randomUUID()}@example.com` }).returning();
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

describe("lock order", () => {
  beforeAll(() => connection.migrate());
  afterAll(() => connection.close());

  it("makes consent submission wait on the user before it touches the voice", async () => {
    const { userId, voiceId } = await seedVoice();
    const submission = await database.transaction(async (holder) => {
      await holder.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const pending = consents.insertChecking(newConsent(userId, voiceId));
      await settle();
      // 제출이 음성을 먼저 잡았다면 NOWAIT가 실패한다. 계정 삭제와 교착이 나던 순서다.
      const voices = await holder
        .select({ id: voiceProfiles.id })
        .from(voiceProfiles)
        .where(eq(voiceProfiles.id, voiceId))
        .for("update", { noWait: true });
      expect(voices).toHaveLength(1);
      await holder.delete(users).where(eq(users.id, userId));
      return { pending };
    });
    expect(await submission.pending).toBe("voice_gone");
    expect(await database.select().from(consentRecords).where(eq(consentRecords.voiceProfileId, voiceId))).toEqual([]);
  });

  it("makes a batch render wait on the user before it touches the voice", async () => {
    const { userId, voiceId } = await seedVoice();
    const consent = newConsent(userId, voiceId);
    await consents.insertChecking(consent);
    await consents.activate(consent.id, 1);
    const render = {
      userId,
      voiceId,
      storyId: "s",
      storyVersion: "v",
      renderKey: randomUUID(),
      refClipIds: [],
      engineId: "e",
      engineVersion: "1",
      chaptersTotal: 1,
      startedAt: new Date(),
    };
    const start = await database.transaction(async (holder) => {
      await holder.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const pending = renderRepo.begin(render, false);
      await settle();
      // 렌더가 음성을 먼저 잡았다면 NOWAIT가 실패한다. renders의 user_id FK 검사로 계정 삭제와 교착이 나는 순서다.
      const voices = await holder
        .select({ id: voiceProfiles.id })
        .from(voiceProfiles)
        .where(eq(voiceProfiles.id, voiceId))
        .for("update", { noWait: true });
      expect(voices).toHaveLength(1);
      await holder.delete(users).where(eq(users.id, userId));
      return { pending };
    });
    expect(await start.pending).toEqual({ kind: "no_active_consent" });
  });

  it("makes a worker claim wait on the user before it touches the voice", async () => {
    const { userId, voiceId } = await seedVoice();
    const consent = newConsent(userId, voiceId);
    await consents.insertChecking(consent);
    await consents.activate(consent.id, 1);
    const plan = { userId, voiceId, storyId: "s", storyVersion: "v", renderKey: randomUUID(), refClipIds: [], engineId: "e", engineVersion: "1", chaptersTotal: 1, startedAt: new Date() };
    const [queued] = await database.insert(renders).values({ ...plan, voiceProfileId: voiceId, status: "queued" }).returning({ id: renders.id });
    if (!queued) throw new Error("render not inserted");
    const claim = await database.transaction(async (holder) => {
      await holder.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const pending = workerRepo.claim(queued.id, { ...plan, renderKey: randomUUID() }, new Date());
      await settle();
      // 워커가 음성을 먼저 잡았다면 NOWAIT가 실패한다. 계정 삭제와 교착이 나는 순서다.
      const voices = await holder.select({ id: voiceProfiles.id }).from(voiceProfiles).where(eq(voiceProfiles.id, voiceId)).for("update", { noWait: true });
      expect(voices).toHaveLength(1);
      await holder.delete(users).where(eq(users.id, userId));
      return { pending };
    });
    expect(await claim.pending).toBe("no_active_consent");
  });

  it("makes a voice change wait on the user before it touches the voice", async () => {
    const { userId, voiceId } = await seedVoice();
    const change = await database.transaction(async (holder) => {
      await holder.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const pending = voiceRepo.applyChange(voiceId, userId, { label: "아빠" });
      await settle();
      // 변경이 음성을 먼저 잡았다면 NOWAIT가 실패한다.
      const voices = await holder
        .select({ id: voiceProfiles.id })
        .from(voiceProfiles)
        .where(eq(voiceProfiles.id, voiceId))
        .for("update", { noWait: true });
      expect(voices).toHaveLength(1);
      await holder.delete(users).where(eq(users.id, userId));
      return { pending };
    });
    expect(await change.pending).toEqual({ kind: "not_found" });
  });

  it("makes activation wait on the voice before it touches the consent", async () => {
    const { userId, voiceId } = await seedVoice();
    const consent = newConsent(userId, voiceId);
    await consents.insertChecking(consent);
    const activation = await database.transaction(async (holder) => {
      await holder.select({ id: voiceProfiles.id }).from(voiceProfiles).where(eq(voiceProfiles.id, voiceId)).for("update");
      const pending = consents.activate(consent.id, 1);
      await settle();
      const rows = await holder
        .select({ id: consentRecords.id })
        .from(consentRecords)
        .where(eq(consentRecords.id, consent.id))
        .for("update", { noWait: true });
      expect(rows).toHaveLength(1);
      await holder.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.id, consent.id));
      await holder.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
      return { pending };
    });
    expect(await activation.pending).toBe(false);
    const [receipt] = await database.select().from(consentRecords).where(eq(consentRecords.id, consent.id));
    expect(receipt?.status).toBe("revoked");
  });

  it("lets a worker claim and an operator start on one queued render end with one runner and no error", async () => {
    const seeds = await Promise.all(Array.from({ length: 8 }, seedVoice));
    const raced = await Promise.all(seeds.map(async ({ userId, voiceId }) => {
      const consent = newConsent(userId, voiceId);
      await consents.insertChecking(consent);
      await consents.activate(consent.id, 1);
      const plan = { userId, voiceId, storyId: "s", storyVersion: "v", renderKey: randomUUID(), refClipIds: [], engineId: "e", engineVersion: "1", chaptersTotal: 1, startedAt: new Date() };
      const [queued] = await database.insert(renders).values({ ...plan, voiceProfileId: voiceId, status: "queued" }).returning({ id: renders.id });
      if (!queued) throw new Error("render not inserted");
      return Promise.allSettled([workerRepo.claim(queued.id, plan, new Date()), renderRepo.begin(plan, false)]);
    }));
    expect(raced.flat().filter((result) => result.status === "rejected")).toEqual([]);
    const running = await Promise.all(seeds.map(({ voiceId }) => database.select().from(renders).where(eq(renders.voiceProfileId, voiceId))));
    expect(running.map((rows) => rows.filter((row) => row.status === "running").length)).toEqual(seeds.map(() => 1));
  });

  it("finishes account deletion and submission without a deadlock when they really race", async () => {
    const seeds = await Promise.all(Array.from({ length: 12 }, seedVoice));
    const results = await Promise.allSettled(
      seeds.flatMap(({ userId, voiceId }) => [
        consents.insertChecking(newConsent(userId, voiceId)),
        deletion.deleteAccount(userId, new Date()),
      ]),
    );
    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    const live = await Promise.all(
      seeds.map(({ voiceId }) => database.select().from(consentRecords).where(eq(consentRecords.voiceProfileId, voiceId))),
    );
    expect(live.flat().filter((row) => row.status !== "revoked")).toEqual([]);
  });
});
