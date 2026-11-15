import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { silentRecording, toneRecording } from "../../../testing/audio-fixtures";
import { createTestRuntime, loginAs, postJson, type TestRuntime } from "../../../testing/test-runtime";
import {
  clipFields,
  consentFields,
  createVoiceFor,
  issuePhrase,
  postForm,
  submitConsentFor,
  validClip,
} from "../../../testing/voices";
import { wireRetention } from "../../../wiring/retention";
import { consentRecords } from "../../db/schema";

describe("consent routes", () => {
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

  describe("consent", () => {
    it("holds consent in checking and queues verification without opening the gate", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      const response = await submitConsentFor(runtime, voiceId, cookie, consentAudio);
      expect(response.status).toBe(202);
      const [receipt] = await runtime.database.select().from(consentRecords).where(eq(consentRecords.kind, "speaker_voice"));
      expect(receipt).toMatchObject({ status: "checking", speakerLabel: "엄마", voiceProfileId: voiceId });
      expect(receipt?.phrase).toContain("동의합니다");
      expect(receipt?.phraseAudioSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(runtime.jobs).toEqual([{ kind: "verify-consent", id: receipt?.id }]);
      expect((await uploadClip(voiceId)).status).toBe(403);
    });

    it("writes no receipt row until the parent actually submits", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      await issuePhrase(runtime, voiceId, cookie);
      const rows = await runtime.database.select().from(consentRecords).where(eq(consentRecords.kind, "speaker_voice"));
      expect(rows).toEqual([]);
    });

    it("keeps the submission when the queue is down and lets the reconciler requeue it", async () => {
      const down = { ...runtime.queue, enqueueVerifyConsent: () => Promise.reject(new Error("queue down")) };
      runtime = await createTestRuntime({ queue: down });
      cookie = await loginAs(runtime, "parent@example.com");
      const voiceId = await createVoiceFor(runtime, cookie);
      expect((await submitConsentFor(runtime, voiceId, cookie, consentAudio)).status).toBe(202);
      const summary = await wireRetention({
        database: runtime.database,
        storage: runtime.storage,
        engine: { purge: async () => {} },
        queue: runtime.queue,
        clock: runtime.clock,
      }).reconcile();
      expect(summary.verifyRequeued).toBe(1);
      expect(runtime.jobs).toEqual([{ kind: "verify-consent", id: expect.any(String) }]);
    });

    it("rejects a phrase issued for another voice, a forged one and an expired one", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      const otherVoice = await createVoiceFor(runtime, cookie, "아빠");
      const { phraseToken } = await issuePhrase(runtime, otherVoice, cookie);
      const path = `/v1/voices/${voiceId}/consent`;
      expect((await postForm(runtime, path, cookie, consentFields(phraseToken), consentAudio)).status).toBe(400);
      expect((await postForm(runtime, path, cookie, consentFields("forged"), consentAudio)).status).toBe(400);
      const own = await issuePhrase(runtime, voiceId, cookie);
      runtime.advance(10 * 60_000);
      expect((await postForm(runtime, path, cookie, consentFields(own.phraseToken), consentAudio)).status).toBe(400);
    });

    it("requires the own-voice confirmation and current terms", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      const { phraseToken } = await issuePhrase(runtime, voiceId, cookie);
      const path = `/v1/voices/${voiceId}/consent`;
      const fields = consentFields(phraseToken);
      expect((await postForm(runtime, path, cookie, { ...fields, confirmedOwnVoice: "false" }, consentAudio)).status).toBe(400);
      expect((await postForm(runtime, path, cookie, { ...fields, termsVersion: "old" }, consentAudio)).status).toBe(400);
    });

    it("refuses a second consent while one is live", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      await submitConsentFor(runtime, voiceId, cookie, consentAudio);
      expect((await submitConsentFor(runtime, voiceId, cookie, consentAudio)).status).toBe(409);
    });

    it("rejects a silent reading through the same signal checks", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      const response = await submitConsentFor(runtime, voiceId, cookie, silentRecording(6));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: "signal_rejected" });
      expect(runtime.storage.keys()).toEqual([]);
    });

    it("hides another parent's voice", async () => {
      const voiceId = await createVoiceFor(runtime, cookie);
      const other = await loginAs(runtime, "other@example.com");
      const response = await postJson(runtime, `/v1/voices/${voiceId}/consent/phrase`, {}, { cookie: other });
      expect(response.status).toBe(404);
    });
  });
});
