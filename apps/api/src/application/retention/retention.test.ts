import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createPurgeRepo, createRetentionRepo } from "../../adapters/db/repos/retention-repo";
import { consentRecords, devicePairings, otpCodes, pendingPurges, voiceClips } from "../../adapters/db/schema";
import { DAY_MS } from "../../domain/identity/otp-limits";
import { consentAudioKey } from "../../domain/storage-keys";
import { seedFullAccount } from "../../testing/deletion-fixture";
import { seedPrompt } from "../../testing/seed-library";
import { createTestRuntime, postJson, type TestRuntime } from "../../testing/test-runtime";
import { wireRetention } from "../../wiring/retention";
import { purgePending } from "./purge-pending";
import { reconcileOrphans } from "./reconcile-orphans";

const BYTES = new TextEncoder().encode("x");
const HOUR = 3_600_000;

describe("retention", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime();
  });

  const retention = (engineFails = false) =>
    wireRetention({
      database: runtime.database,
      storage: runtime.storage,
      engine: {
        purge: async () => {
          if (engineFails) throw new Error("engine down");
        },
      },
      queue: runtime.queue,
      clock: runtime.clock,
    });

  it("keeps a purge row when the engine fails so it can be retried", async () => {
    await runtime.database.insert(pendingPurges).values({ storagePrefix: "u/x/", engineKeys: ["k"] });
    await runtime.storage.put("u/x/a", BYTES, "text/plain");
    expect(await retention(true).purge()).toEqual({ purged: 0, failed: 1 });
    expect(await runtime.database.select().from(pendingPurges)).toHaveLength(1);
    expect(await retention().purge()).toEqual({ purged: 1, failed: 0 });
    expect(await runtime.database.select().from(pendingPurges)).toEqual([]);
  });

  it("is safe to run twice", async () => {
    await runtime.database.insert(pendingPurges).values({ storagePrefix: "u/x/", engineKeys: [] });
    await retention().purge();
    expect(await retention().purge()).toEqual({ purged: 0, failed: 0 });
  });

  it("deletes an object no row refers to only after the grace period", async () => {
    await runtime.storage.put("u/ghost/v/ghost/clips/a.wav", BYTES, "audio/wav");
    expect((await retention().reconcile()).orphansDeleted).toBe(0);
    expect(runtime.storage.keys()).toHaveLength(1);
    runtime.advance(DAY_MS + HOUR);
    expect((await retention().reconcile()).orphansDeleted).toBe(1);
    expect(runtime.storage.keys()).toEqual([]);
  });

  it("never deletes objects still referenced by clips, chapters or prompts", async () => {
    const account = await seedFullAccount(runtime, "parent@example.com");
    await seedPrompt(runtime, account.userId, account.voiceId, account.consentId);
    const keysBefore = runtime.storage.keys();
    runtime.advance(DAY_MS + HOUR);
    expect((await retention().reconcile()).orphansDeleted).toBe(0);
    expect(runtime.storage.keys()).toEqual(keysBefore);
  });

  it("cleans up the object of a failed clip when verification could not delete it", async () => {
    const { voiceId } = await seedFullAccount(runtime, "parent@example.com");
    const [clip] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.voiceProfileId, voiceId));
    if (clip === undefined) throw new Error("clip missing");
    await runtime.database.update(voiceClips).set({ status: "failed" }).where(eq(voiceClips.id, clip.id));
    runtime.advance(DAY_MS + HOUR);
    await retention().reconcile();
    expect(runtime.storage.keys()).not.toContain(clip.storageKey);
  });

  it("keeps a reading while it awaits verification and removes it once consent is decided", async () => {
    const { userId, voiceId } = await seedFullAccount(runtime, "parent@example.com");
    const consentId = randomUUID();
    const key = consentAudioKey(userId, voiceId, consentId);
    await runtime.storage.put(key, BYTES, "audio/wav");
    await runtime.database.insert(consentRecords).values({
      id: consentId,
      kind: "speaker_voice",
      userId,
      voiceProfileId: randomUUID(),
      termsVersion: "1",
      aiNoticeVersion: "1",
      status: "checking",
      givenAt: runtime.clock(),
    });
    runtime.advance(DAY_MS + HOUR);
    expect((await retention().reconcile()).orphansDeleted).toBe(0);
    expect(runtime.storage.keys()).toContain(key);
    await runtime.database.update(consentRecords).set({ status: "active" }).where(eq(consentRecords.id, consentId));
    expect((await retention().reconcile()).orphansDeleted).toBe(1);
    expect(runtime.storage.keys()).not.toContain(key);
  });

  it("reports why a purge failed", async () => {
    await runtime.database.insert(pendingPurges).values({ storagePrefix: "u/x/", engineKeys: ["k"] });
    const reported: unknown[] = [];
    const purge = purgePending({
      purges: createPurgeRepo(runtime.database),
      storage: runtime.storage,
      engine: { purge: () => Promise.reject(new Error("engine down")) },
      reportFailure: (_id, error) => reported.push(error),
    });
    expect(await purge()).toEqual({ purged: 0, failed: 1 });
    expect(reported).toEqual([new Error("engine down")]);
  });

  it("requeues every check still waiting so a lost job cannot strand it", async () => {
    const account = await seedFullAccount(runtime, "parent@example.com");
    const consentId = randomUUID();
    await runtime.database.insert(consentRecords).values({
      id: consentId,
      kind: "speaker_voice",
      userId: account.userId,
      voiceProfileId: randomUUID(),
      termsVersion: "1",
      aiNoticeVersion: "1",
      status: "checking",
      givenAt: runtime.clock(),
    });
    const summary = await retention().reconcile();
    expect(summary.verifyRequeued).toBe(2);
    expect(runtime.jobs).toEqual(
      expect.arrayContaining([
        { kind: "verify-clip", id: account.clip.clipId },
        { kind: "verify-consent", id: consentId },
      ]),
    );
  });

  it("finishes the other phases when one fails and reports the failure", async () => {
    const reported: string[] = [];
    await postJson(runtime, "/v1/auth/otp/request", { email: "a@example.com" });
    runtime.advance(DAY_MS + HOUR);
    const reconcile = reconcileOrphans({
      purgeAll: async () => ({ purged: 0, failed: 0 }),
      retention: createRetentionRepo(runtime.database),
      storage: { ...runtime.storage, list: () => Promise.reject(new Error("storage down")) },
      queue: runtime.queue,
      clock: runtime.clock,
      graceMs: DAY_MS,
      otpHistoryMs: DAY_MS,
      reportFailure: (phase) => reported.push(phase),
    });
    expect((await reconcile()).failed).toBe(1);
    expect(reported).toEqual(["orphans"]);
    expect(await runtime.database.select().from(otpCodes)).toEqual([]);
  });

  it("clears expired sign-in rows but keeps today's failure history", async () => {
    await postJson(runtime, "/v1/auth/otp/request", { email: "a@example.com" });
    await postJson(runtime, "/v1/devices/pair/start", { deviceName: "차" });
    runtime.advance(HOUR);
    await retention().reconcile();
    expect(await runtime.database.select().from(otpCodes)).toHaveLength(1);
    runtime.advance(DAY_MS);
    await retention().reconcile();
    expect(await runtime.database.select().from(otpCodes)).toEqual([]);
    expect(await runtime.database.select().from(devicePairings)).toEqual([]);
  });
});
