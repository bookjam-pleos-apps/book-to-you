import { manifestSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { seedPrompt, seedRender, seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import {
  createTestRuntime,
  deleteAs,
  listDevicesOf,
  loginAs,
  pairVehicle,
  type TestRuntime,
} from "../../../testing/test-runtime";
import { consentRecords, voiceProfiles } from "../../db/schema";

describe("vehicle library", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let userId: string;
  let bearer: { authorization: string };

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
    userId = await userIdOf(runtime, cookie);
    bearer = { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` };
  });

  const manifest = async (headers: Record<string, string> = bearer) => {
    const response = await runtime.app.request("/v1/library/manifest", { headers });
    expect(response.status).toBe(200);
    return manifestSchema.parse(await response.json());
  };

  const audio = (id: string, headers: Record<string, string> = bearer) =>
    runtime.app.request(`/v1/audio/${id}`, { headers });

  it("returns an empty but valid manifest for a new vehicle", async () => {
    expect(await manifest()).toEqual({ schemaVersion: 1, maxOfflineSeconds: 604800, defaultVoiceId: null, stories: [], prompts: [] });
  });

  it("lists finished renders with ordered chapters and the fixed audio path", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { renderId } = await seedRender(runtime, { userId, voiceId });
    const { stories } = await manifest();
    expect(stories).toMatchObject([{ renderId, storyId: "toto-picnic", title: "토토의 소풍", voiceId, voiceLabel: "엄마" }]);
    expect(stories[0]?.chapters.map((chapter) => chapter.index)).toEqual([0, 1]);
    expect(stories[0]?.chapters[0]?.audioUrl).toMatch(/^\/v1\/audio\/[0-9a-f-]{36}$/);
  });

  it("lists only the most recently finished render when a story was rendered again", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    await seedRender(runtime, { userId, voiceId, finishedAt: new Date("2026-11-08T14:00:00Z") });
    const { renderId: rerendered } = await seedRender(runtime, { userId, voiceId, finishedAt: new Date("2026-11-08T15:00:00Z") });
    const { renderId: otherStory } = await seedRender(runtime, { userId, voiceId, storyId: "masteraway" });
    const { stories } = await manifest();
    expect(stories.map((story) => story.renderId).toSorted()).toEqual([rerendered, otherStory].toSorted());
    expect(stories.some((story) => "finishedAt" in story)).toBe(false);
  });

  it("keeps a story whose title is missing so the vehicle does not delete its cache", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    await seedRender(runtime, { userId, voiceId, storyId: "unknown-story" });
    expect((await manifest()).stories[0]?.title).toBe("unknown-story");
  });

  it.each(["queued", "running", "failed"] as const)("hides a %s render", async (status) => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId, status });
    expect((await manifest()).stories).toEqual([]);
    expect((await audio(chapterIds[0] ?? "")).status).toBe(404);
  });

  it("streams a chapter with its metadata", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    const response = await audio(chapterIds[0] ?? "");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0123456789");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-type")).toBe("audio/mp4");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("serves a byte range and rejects one past the end", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    const partial = await audio(chapterIds[0] ?? "", { ...bearer, range: "bytes=2-4" });
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe("234");
    expect(partial.headers.get("content-range")).toBe("bytes 2-4/10");
    const outside = await audio(chapterIds[0] ?? "", { ...bearer, range: "bytes=10-" });
    expect(outside.status).toBe(416);
    expect(outside.headers.get("content-range")).toBe("bytes */10");
  });

  it("answers HEAD for an allowed audio route without reading the object", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    const response = await runtime.app.request(`/v1/audio/${chapterIds[0]}`, { method: "HEAD", headers: bearer });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("10");
    expect(await response.text()).toBe("");
  });

  it("hides another parent's audio", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    const other = await loginAs(runtime, "other@example.com");
    const otherBearer = { authorization: `Bearer ${await pairVehicle(runtime, other)}` };
    expect((await audio(chapterIds[0] ?? "", otherBearer)).status).toBe(404);
    expect((await manifest(otherBearer)).stories).toEqual([]);
  });

  it("stops a revoked device on its very next request", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    expect((await audio(chapterIds[0] ?? "")).status).toBe(200);
    const [device] = await listDevicesOf(runtime, cookie);
    await deleteAs(runtime, `/v1/devices/${device?.id}`, cookie);
    expect((await audio(chapterIds[0] ?? "")).status).toBe(401);
    expect((await runtime.app.request("/v1/library/manifest", { headers: bearer })).status).toBe(401);
  });

  it("stops audio and the manifest as soon as consent is no longer active", async () => {
    const { voiceId, consentId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    await runtime.database.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.id, consentId));
    expect((await audio(chapterIds[0] ?? "")).status).toBe(404);
    expect((await manifest()).stories).toEqual([]);
  });

  it("treats a voice with no active consent as unplayable", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    await runtime.database.update(voiceProfiles).set({ activeConsentId: null }).where(eq(voiceProfiles.id, voiceId));
    expect((await audio(chapterIds[0] ?? "")).status).toBe(404);
    expect((await manifest()).stories).toEqual([]);
  });

  it("stops audio as soon as the voice is deleted", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const { chapterIds } = await seedRender(runtime, { userId, voiceId });
    await runtime.database.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
    expect((await audio(chapterIds[0] ?? "")).status).toBe(404);
  });

  it("lists and streams a parent voice prompt under the same consent gate", async () => {
    const { voiceId, consentId } = await seedVoiceWithConsent(runtime, userId);
    const promptId = await seedPrompt(runtime, userId, voiceId, consentId);
    const { prompts } = await manifest();
    expect(prompts).toMatchObject([{ id: promptId, kind: "belt_unfastened", voiceId, audioUrl: `/v1/audio/${promptId}` }]);
    expect((await audio(promptId)).headers.get("content-type")).toBe("audio/wav");
    await runtime.database.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.id, consentId));
    expect((await audio(promptId)).status).toBe(404);
    expect((await manifest()).prompts).toEqual([]);
  });

  it("lets a logged-in parent read the library too", async () => {
    expect((await manifest({ cookie })).stories).toEqual([]);
  });

  it("rejects anonymous callers and answers 404 for malformed ids", async () => {
    expect((await runtime.app.request("/v1/library/manifest")).status).toBe(401);
    expect((await audio("not-a-uuid")).status).toBe(404);
  });
});
