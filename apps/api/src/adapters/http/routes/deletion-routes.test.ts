import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { JobQueue } from "../../../application/ports/job-queue";
import { receiptsOf, seedClipWithHandle, seedFullAccount } from "../../../testing/deletion-fixture";
import { createTestRuntime, deleteAs, type TestRuntime } from "../../../testing/test-runtime";
import { wireRetention } from "../../../wiring/retention";
import {
  devices,
  otpCodes,
  pendingPurges,
  renderChapters,
  renders,
  sessions,
  users,
  voiceClips,
  voiceHandles,
  voiceProfiles,
} from "../../db/schema";

const retentionOf = (runtime: TestRuntime, purged: string[] = []) =>
  wireRetention({
    database: runtime.database,
    storage: runtime.storage,
    engine: { purge: async (keys) => void purged.push(...keys) },
    queue: runtime.queue,
    clock: runtime.clock,
  });

describe("deletion", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime();
  });

  describe("DELETE /v1/voices/:id", () => {
    it("removes the voice in one commit, revokes consent and queues a purge", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const response = await deleteAs(runtime, `/v1/voices/${account.voiceId}`, account.cookie);
      expect(response.status).toBe(204);
      expect(await runtime.database.select().from(voiceProfiles)).toEqual([]);
      expect(await runtime.database.select().from(voiceClips)).toEqual([]);
      expect(await runtime.database.select().from(voiceHandles)).toEqual([]);
      expect(await runtime.database.select().from(renders)).toEqual([]);
      expect(await runtime.database.select().from(renderChapters)).toEqual([]);
      const receipt = (await receiptsOf(runtime)).find((row) => row.id === account.consentId);
      expect(receipt).toMatchObject({ status: "revoked", userId: account.userId, voiceProfileId: account.voiceId });
      expect(receipt?.revokedAt).toBeInstanceOf(Date);
      expect(runtime.jobs.at(-1)).toEqual({ kind: "purge" });
    });

    it("stops the vehicle's audio before any object is purged", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const chapterId = account.render.chapterIds[0];
      expect((await runtime.app.request(`/v1/audio/${chapterId}`, { headers: account.bearer })).status).toBe(200);
      await deleteAs(runtime, `/v1/voices/${account.voiceId}`, account.cookie);
      expect(runtime.storage.keys().length).toBeGreaterThan(0);
      expect((await runtime.app.request(`/v1/audio/${chapterId}`, { headers: account.bearer })).status).toBe(404);
    });

    it("purges the voice prefix and engine keys, and leaves other voices alone", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const other = await seedFullAccount(runtime, "other@example.com");
      await deleteAs(runtime, `/v1/voices/${account.voiceId}`, account.cookie);
      const purged: string[] = [];
      expect(await retentionOf(runtime, purged).purge()).toEqual({ purged: 1, failed: 0 });
      expect(runtime.storage.keys().filter((key) => key.includes(account.voiceId))).toEqual([]);
      expect(runtime.storage.keys().filter((key) => key.includes(other.voiceId)).length).toBeGreaterThan(0);
      expect(purged).toHaveLength(1);
      expect(await runtime.database.select().from(pendingPurges)).toEqual([]);
    });

    it("hides another parent's voice", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const other = await seedFullAccount(runtime, "other@example.com");
      expect((await deleteAs(runtime, `/v1/voices/${account.voiceId}`, other.cookie)).status).toBe(404);
      expect(await runtime.database.select().from(voiceProfiles).where(eq(voiceProfiles.id, account.voiceId))).toHaveLength(1);
    });
  });

  describe("DELETE /v1/voices/:id/clips/:clipId", () => {
    it("removes one clip and its object but keeps the voice", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const sibling = await seedClipWithHandle(runtime, account.userId, account.voiceId, account.consentId, "sibling");
      const path = `/v1/voices/${account.voiceId}/clips/${account.clip.clipId}`;
      expect((await deleteAs(runtime, path, account.cookie)).status).toBe(204);
      const purged: string[] = [];
      await retentionOf(runtime, purged).purge();
      expect(runtime.storage.keys()).not.toContain(account.clip.storageKey);
      expect(runtime.storage.keys()).toContain(sibling.storageKey);
      expect(purged).toHaveLength(1);
      expect(await runtime.database.select().from(voiceProfiles)).toHaveLength(1);
    });

    it("purges the key the row recorded, not one it rebuilds", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const legacyKey = `u/${account.userId}/legacy/${account.clip.clipId}.wav`;
      await runtime.storage.put(legacyKey, new TextEncoder().encode("voice"), "audio/wav");
      await runtime.database.update(voiceClips).set({ storageKey: legacyKey }).where(eq(voiceClips.id, account.clip.clipId));
      await deleteAs(runtime, `/v1/voices/${account.voiceId}/clips/${account.clip.clipId}`, account.cookie);
      await retentionOf(runtime).purge();
      expect(runtime.storage.keys()).not.toContain(legacyKey);
    });

    it("hides another parent's clip", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const other = await seedFullAccount(runtime, "other@example.com");
      const path = `/v1/voices/${account.voiceId}/clips/${account.clip.clipId}`;
      expect((await deleteAs(runtime, path, other.cookie)).status).toBe(404);
      expect(runtime.storage.keys()).toContain(account.clip.storageKey);
    });
  });

  describe("DELETE /v1/me", () => {
    it("removes the whole account, keeps revoked receipts and clears the session", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const response = await deleteAs(runtime, "/v1/me", account.cookie);
      expect(response.status).toBe(204);
      expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
      expect(await runtime.database.select().from(users)).toEqual([]);
      expect(await runtime.database.select().from(sessions)).toEqual([]);
      expect(await runtime.database.select().from(devices)).toEqual([]);
      expect(await runtime.database.select().from(otpCodes)).toEqual([]);
      const receipts = await receiptsOf(runtime);
      expect(receipts.map((row) => row.kind).toSorted()).toEqual(["account_terms", "speaker_voice"]);
      expect(receipts.every((row) => row.status === "revoked" && row.userId === null)).toBe(true);
    });

    it("rejects the old session and device token immediately", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      await deleteAs(runtime, "/v1/me", account.cookie);
      expect((await runtime.app.request("/v1/me", { headers: { cookie: account.cookie } })).status).toBe(401);
      expect((await runtime.app.request("/v1/library/manifest", { headers: account.bearer })).status).toBe(401);
    });

    it("leaves no object behind after the purge and no other account is touched", async () => {
      const account = await seedFullAccount(runtime, "parent@example.com");
      const other = await seedFullAccount(runtime, "other@example.com");
      await deleteAs(runtime, "/v1/me", account.cookie);
      const purged: string[] = [];
      await retentionOf(runtime, purged).purge();
      expect(runtime.storage.keys().filter((key) => key.startsWith(`u/${account.userId}/`))).toEqual([]);
      expect(runtime.storage.keys().filter((key) => key.startsWith(`u/${other.userId}/`)).length).toBeGreaterThan(0);
      expect(purged).toHaveLength(1);
    });
  });

  describe("crash between commit and enqueue", () => {
    const failingQueue: JobQueue = {
      enqueueVerifyClip: async () => {},
      enqueueVerifyConsent: async () => {},
      enqueuePurge: () => Promise.reject(new Error("queue down")),
    };

    it("still answers 204 and the reconciler finishes storage and engine keys", async () => {
      runtime = await createTestRuntime({ queue: failingQueue });
      const account = await seedFullAccount(runtime, "parent@example.com");
      expect((await deleteAs(runtime, "/v1/me", account.cookie)).status).toBe(204);
      const [pending] = await runtime.database.select().from(pendingPurges);
      expect(pending?.storagePrefix).toBe(`u/${account.userId}/`);
      expect(pending?.engineKeys).toHaveLength(1);
      const purged: string[] = [];
      expect(await retentionOf(runtime, purged).reconcile()).toMatchObject({ purged: 1, failed: 0 });
      expect(runtime.storage.keys()).toEqual([]);
      expect(purged).toEqual(pending?.engineKeys);
    });
  });
});
