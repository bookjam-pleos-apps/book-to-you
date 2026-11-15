import { manifestSchema, promptResponseSchema, signalRejectedResponseSchema } from "@voice-storybook/shared/contracts/v1";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { toneRecording } from "../../../testing/audio-fixtures";
import { createTestRuntime, loginAs, pairVehicle, type TestRuntime } from "../../../testing/test-runtime";
import { createActiveVoice, createVoiceFor, postForm } from "../../../testing/voices";
import { wireRetention } from "../../../wiring/retention";
import { pendingPurges, voicePrompts } from "../../db/schema";

const FIELDS = { scriptId: "belt_unfastened", scriptVersion: "1" };

describe("parent voice prompts", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let prompt: Uint8Array;
  let consentAudio: Uint8Array;

  beforeAll(() => {
    prompt = toneRecording({ seconds: 4 });
    consentAudio = toneRecording({ seconds: 6 });
  });

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
  });

  const upload = (voiceId: string, audio = prompt, fields = FIELDS, kind = "belt_unfastened") =>
    postForm(runtime, `/v1/voices/${voiceId}/prompts/${kind}`, cookie, fields, audio);

  it("rejects a prompt without active consent", async () => {
    const voiceId = await createVoiceFor(runtime, cookie);
    expect((await upload(voiceId)).status).toBe(403);
    expect(runtime.storage.keys()).toEqual([]);
  });

  it("makes a prompt available to the vehicle right after the signal check", async () => {
    const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
    const response = await upload(voiceId);
    expect(response.status).toBe(201);
    const { id } = promptResponseSchema.parse(await response.json());
    const headers = { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` };
    const manifest = manifestSchema.parse(await (await runtime.app.request("/v1/library/manifest", { headers })).json());
    expect(manifest.prompts).toMatchObject([{ id, kind: "belt_unfastened", voiceId }]);
    const audio = await runtime.app.request(`/v1/audio/${id}`, { headers });
    expect(audio.headers.get("content-type")).toBe("audio/wav");
    expect(Number(audio.headers.get("content-length"))).toBe(manifest.prompts[0]?.bytes);
    expect((await audio.arrayBuffer()).byteLength).toBe(manifest.prompts[0]?.bytes);
  });

  it("uses the prompt length limits rather than the clip limits", async () => {
    const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
    const tooLong = await upload(voiceId, toneRecording({ seconds: 12 }));
    expect(tooLong.status).toBe(422);
    expect(signalRejectedResponseSchema.parse(await tooLong.json()).reasons).toContain("too_long");
  });

  it("replaces the previous recording and purges its object", async () => {
    const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
    await upload(voiceId);
    const [first] = await runtime.database.select().from(voicePrompts);
    expect(runtime.jobs.filter((job) => job.kind === "purge")).toEqual([]);
    await upload(voiceId);
    expect(runtime.jobs.filter((job) => job.kind === "purge")).toHaveLength(1);
    const rows = await runtime.database.select().from(voicePrompts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.storageKey).not.toBe(first?.storageKey);
    expect(await runtime.database.select().from(pendingPurges)).toHaveLength(1);
    await wireRetention({
      database: runtime.database,
      storage: runtime.storage,
      engine: { purge: async () => {} },
      queue: runtime.queue,
      clock: runtime.clock,
    }).purge();
    expect(runtime.storage.keys()).not.toContain(first?.storageKey);
    expect(runtime.storage.keys()).toContain(rows[0]?.storageKey);
  });

  it("rejects an unknown kind and a script for another kind", async () => {
    const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
    expect((await upload(voiceId, prompt, FIELDS, "seat_warning")).status).toBe(404);
    expect((await upload(voiceId, prompt, { ...FIELDS, scriptId: "calm" })).status).toBe(400);
  });
});
