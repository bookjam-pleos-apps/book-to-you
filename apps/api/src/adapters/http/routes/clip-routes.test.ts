import {
  recordingScriptsResponseSchema,
  signalRejectedResponseSchema,
  voiceListResponseSchema,
  voiceSchema,
} from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POLICY } from "../../../config";
import { silentRecording, toneRecording } from "../../../testing/audio-fixtures";
import { createTestRuntime, loginAs, TEST_ORIGIN, type TestRuntime } from "../../../testing/test-runtime";
import { clipFields, createActiveVoice, createVoiceFor, postForm, validClip } from "../../../testing/voices";
import { voiceClips, voiceProfiles } from "../../db/schema";
import { createFfmpegAudioTool } from "../../ffmpeg/ffmpeg-audio-tool";

describe("clip routes", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let clip: Uint8Array;
  let consentAudio: Uint8Array;

  beforeAll(() => {
    clip = validClip();
    consentAudio = toneRecording({ seconds: 6 });
  });

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
  });

  const uploadClip = (voiceId: string, audio: Uint8Array | null = clip, fields = clipFields()) =>
    postForm(runtime, `/v1/voices/${voiceId}/clips`, cookie, fields, audio);

  describe("clip upload", () => {
    it("rejects an upload without active consent before touching ffmpeg or storage", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      const response = await uploadClip(voiceId, new TextEncoder().encode("not audio"));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "no_active_consent" });
      expect(runtime.storage.keys()).toEqual([]);
    });

    it("stores a valid clip as checking under the voice prefix and queues verification", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      const jobsBefore = runtime.jobs.length;
      const response = await uploadClip(voiceId);
      expect(response.status).toBe(202);
      const [row] = await runtime.database.select().from(voiceClips);
      expect(row).toMatchObject({ status: "checking", style: "calm", scriptId: "calm", scriptVersion: "1" });
      expect(row?.storageKey).toMatch(new RegExp(`^u/[0-9a-f-]+/v/${voiceId}/clips/${row?.id}\\.wav$`));
      expect(row?.signal).toMatchObject({ clippedRatio: 0 });
      expect(runtime.storage.keys()).toContain(row?.storageKey);
      expect(runtime.jobs.slice(jobsBefore)).toEqual([{ kind: "verify-clip", id: row?.id }]);
    });

    it("answers 202 when the queue is down because the clip is already stored", async () => {
      const down = { ...runtime.queue, enqueueVerifyClip: () => Promise.reject(new Error("queue down")) };
      runtime = await createTestRuntime({ queue: down });
      cookie = await loginAs(runtime, "parent@example.com");
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      expect((await uploadClip(voiceId)).status).toBe(202);
      expect(await runtime.database.select().from(voiceClips)).toHaveLength(1);
    });

    it("reports progress per style", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      await uploadClip(voiceId);
      const voice = voiceSchema.parse(await (await runtime.app.request(`/v1/voices/${voiceId}`, { headers: { cookie } })).json());
      expect(voice).toMatchObject({ consent: "active", label: "엄마" });
      expect(voice.progress).toEqual([
        { style: "calm", status: "checking" },
        { style: "excited", status: "missing" },
        { style: "soft", status: "missing" },
        { style: "deep", status: "missing" },
        { style: "child", status: "missing" },
      ]);
    });

    it.each([
      ["too_short", () => toneRecording({ seconds: 8 })],
      ["too_long", () => toneRecording({ seconds: 25 })],
      ["clipped", () => toneRecording({ seconds: 15, amplitude: 2 })],
      ["too_noisy", () => toneRecording({ seconds: 15, noise: 0.2 })],
    ])("rejects a %s recording and keeps nothing", async (reason, makeAudio) => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      const keysBefore = runtime.storage.keys();
      const response = await uploadClip(voiceId, makeAudio());
      expect(response.status).toBe(422);
      expect(signalRejectedResponseSchema.parse(await response.json()).reasons).toContain(reason);
      expect(runtime.storage.keys()).toEqual(keysBefore);
    });

    it("counts only the voiced part of a recording padded with silence", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      const response = await uploadClip(voiceId, silentRecording(15));
      expect(signalRejectedResponseSchema.parse(await response.json()).reasons).toEqual(
        expect.arrayContaining(["too_short", "too_quiet"]),
      );
    });

    it("accepts browser formats", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      expect((await uploadClip(voiceId, toneRecording({ seconds: 15, extension: "webm" }))).status).toBe(202);
      expect((await uploadClip(voiceId, toneRecording({ seconds: 15, extension: "m4a" }))).status).toBe(202);
    });

    it("rejects a file that is not audio", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      const response = await uploadClip(voiceId, new TextEncoder().encode("not audio"));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "unreadable" });
    });

    it("rejects a missing file, an unknown script and a mismatched style", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      expect((await uploadClip(voiceId, null)).status).toBe(400);
      expect((await uploadClip(voiceId, clip, { ...clipFields(), scriptVersion: "99" })).status).toBe(400);
      expect((await uploadClip(voiceId, clip, { ...clipFields("calm"), scriptId: "soft" })).status).toBe(400);
    });

    it("refuses a body over the limit", async () => {
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      const response = await runtime.app.request(`/v1/voices/${voiceId}/clips`, {
        method: "POST",
        headers: { cookie, origin: TEST_ORIGIN, "content-type": "multipart/form-data; boundary=x", "content-length": String(26 * 1024 * 1024) },
        body: "x",
      });
      expect(response.status).toBe(413);
    });

    it("deletes the object when consent disappears during processing", async () => {
      const audio = createFfmpegAudioTool(POLICY.upload.ffmpeg);
      const during = { beforePrepare: async (): Promise<void> => {} };
      runtime = await createTestRuntime({
        audio: {
          prepare: async (upload) => {
            await during.beforePrepare();
            return audio.prepare(upload);
          },
        },
      });
      cookie = await loginAs(runtime, "parent@example.com");
      const voiceId = await createActiveVoice(runtime, cookie, consentAudio);
      during.beforePrepare = async () => {
        await runtime.database.update(voiceProfiles).set({ activeConsentId: null }).where(eq(voiceProfiles.id, voiceId));
      };
      const keysBefore = runtime.storage.keys();
      expect((await uploadClip(voiceId)).status).toBe(403);
      expect(await runtime.database.select().from(voiceClips)).toEqual([]);
      expect(runtime.storage.keys()).toEqual(keysBefore);
    });
  });

  it("serves a recording script for every style and the belt prompt", async () => {
    const response = await runtime.app.request("/v1/recording-scripts", { headers: { cookie } });
    const body = recordingScriptsResponseSchema.parse(await response.json());
    expect(body.clips.map((script) => script.style)).toEqual(["calm", "excited", "soft", "deep", "child"]);
    expect(body.prompts.map((script) => script.kind)).toEqual(["belt_unfastened"]);
  });

  it("lists voices for their owner only", async () => {
    await createVoiceFor(runtime, cookie);
    const other = await loginAs(runtime, "other@example.com");
    const list = async (session: string) =>
      voiceListResponseSchema.parse(await (await runtime.app.request("/v1/voices", { headers: { cookie: session } })).json());
    expect((await list(cookie)).voices).toHaveLength(1);
    expect((await list(other)).voices).toEqual([]);
  });
});
