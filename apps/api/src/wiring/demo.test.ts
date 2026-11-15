import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { manifestSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { consentRecords, devices, renderChapters, users, voiceProfiles } from "../adapters/db/schema";
import { DEMO_EMAIL } from "../application/demo";
import { activeConsentFor, seedPlayableRender, seedPlayableVoice } from "../testing/demo-seed";
import { createTestRuntime, loginAs, pairVehicle, type TestRuntime } from "../testing/test-runtime";
import { wireDemoTransfer } from "./demo";

const USER_ID = "00000000-0000-4000-8000-0000000000d1";
const CHAPTER_BYTES = new TextEncoder().encode("m4a chapter bytes");

const manifestOf = async (runtime: TestRuntime, token: string) => {
  const response = await runtime.app.request("/v1/library/manifest", { headers: { authorization: `Bearer ${token}` } });
  return manifestSchema.parse(await response.json());
};

const consentAgain = async (runtime: TestRuntime, voiceId: string, userId: string) => {
  await runtime.database.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.voiceProfileId, voiceId));
  const [given] = await runtime.database.insert(consentRecords).values(activeConsentFor(userId, voiceId)).returning();
  await runtime.database.update(voiceProfiles).set({ activeConsentId: given?.id ?? null }).where(eq(voiceProfiles.id, voiceId));
};

describe("moving the demo voice to the demo server", () => {
  let source: TestRuntime;
  let target: TestRuntime;
  let bundlePath: string;
  let voiceId: string;

  beforeEach(async () => {
    source = await createTestRuntime();
    target = await createTestRuntime();
    bundlePath = join(await mkdtemp(join(tmpdir(), "demo-bundle-")), "bundle.json");
    await source.database.insert(users).values({ id: USER_ID, email: "parent@example.com" });
    voiceId = await seedPlayableVoice(source, USER_ID, { label: "엄마", bytes: CHAPTER_BYTES });
  });

  const exportFromSource = (voice = voiceId) => wireDemoTransfer(source, undefined).exportTo(voice, bundlePath);
  const importAs = (demoUserId: string | undefined) => wireDemoTransfer(target, demoUserId).importFrom(bundlePath);
  const importToTarget = () => importAs(USER_ID);

  it("lets a paired vehicle play the moved story with the same bytes", async () => {
    expect(await exportFromSource()).toMatchObject({ kind: "exported", userId: USER_ID, renders: 1, objects: 1 });
    expect(await importToTarget()).toEqual({ kind: "imported", objects: 1, removedObjects: 0 });
    const token = await pairVehicle(target, await loginAs(target, DEMO_EMAIL));
    const [story] = (await manifestOf(target, token)).stories;
    expect(story?.voiceLabel).toBe("엄마");
    const audio = await target.app.request(story?.chapters[0]?.audioUrl ?? "", { headers: { authorization: `Bearer ${token}` } });
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(CHAPTER_BYTES);
  });

  it("does not carry the parent's email and keeps the file private even when overwriting", async () => {
    await writeFile(bundlePath, "old", { mode: 0o644 });
    await exportFromSource();
    expect((await stat(bundlePath)).mode & 0o777).toBe(0o600);
    expect(await readFile(bundlePath, "utf8")).not.toContain("parent@example.com");
    await importToTarget();
    expect((await target.database.select().from(users))[0]?.email).toBe(DEMO_EMAIL);
  });

  it("keeps paired vehicles when the bundle is imported again", async () => {
    await exportFromSource();
    await importToTarget();
    await pairVehicle(target, await loginAs(target, DEMO_EMAIL));
    expect(await importToTarget()).toEqual({ kind: "imported", objects: 1, removedObjects: 0 });
    expect(await target.database.select().from(devices)).toHaveLength(1);
    expect(await target.database.select().from(renderChapters)).toHaveLength(1);
  });

  it("re-imports a voice whose consent was given again", async () => {
    await exportFromSource();
    await importToTarget();
    await consentAgain(source, voiceId, USER_ID);
    await exportFromSource();
    expect(await importToTarget()).toMatchObject({ kind: "imported" });
    expect(await target.database.select().from(consentRecords)).toHaveLength(1);
  });

  it("replaces the previous demo voice and its audio when another voice is imported", async () => {
    await exportFromSource();
    await importToTarget();
    const next = await seedPlayableVoice(source, USER_ID, { label: "아빠", bytes: new TextEncoder().encode("next voice") });
    await exportFromSource(next);
    expect(await importToTarget()).toEqual({ kind: "imported", objects: 1, removedObjects: 1 });
    expect((await target.database.select().from(voiceProfiles)).map((voice) => voice.label)).toEqual(["아빠"]);
    expect(await target.storage.list(`u/${USER_ID}/`)).toHaveLength(1);
  });

  it("moves only the most recently finished render of a story that was rendered again", async () => {
    const rerendered = await seedPlayableRender(source, USER_ID, voiceId, new TextEncoder().encode("v3 render"), new Date("2026-11-09T00:00:00Z"));
    expect(await exportFromSource()).toMatchObject({ kind: "exported", renders: 1 });
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    expect(bundle.snapshot.renders.map(({ id }: { id: string }) => id)).toEqual([rerendered]);
  });

  it("refuses to export a voice whose consent has no reading on record", async () => {
    await source.database.update(consentRecords).set({ phrase: null, matchScore: null });
    expect(await exportFromSource()).toEqual({ kind: "missing_provenance", fields: ["phrase", "matchScore"] });
  });

  it("refuses a bundle for another account or with altered audio, writing nothing", async () => {
    await exportFromSource();
    expect(await importAs("00000000-0000-4000-8000-0000000000ff")).toMatchObject({ kind: "not_demo_user" });
    expect(await importAs(undefined)).toEqual({ kind: "demo_not_configured" });
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.objects[0].base64 = Buffer.from("tampered").toString("base64");
    await writeFile(bundlePath, JSON.stringify(bundle));
    expect(await importToTarget()).toMatchObject({ kind: "corrupt_object" });
    expect(await target.database.select().from(voiceProfiles)).toEqual([]);
  });
});
