import { resolve } from "node:path";

import { voiceSchema } from "@voice-storybook/shared/contracts/v1";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createClipRepo } from "../../adapters/db/repos/clip-repo";
import { createConsentRepo } from "../../adapters/db/repos/consent-repo";
import { consentRecords, voiceClips, voiceProfiles } from "../../adapters/db/schema";
import { toneRecording } from "../../testing/audio-fixtures";
import { analyzerSaying } from "../../testing/fake-clip-analyzer";
import { createTestRuntime, loginAs, type TestRuntime } from "../../testing/test-runtime";
import { clipFields, createVoiceFor, issuePhrase, postForm, consentFields, validClip } from "../../testing/voices";
import { consentAudioKey } from "../../domain/storage-keys";
import { loadRecordingScripts } from "../../adapters/content/recording-scripts";
import { TranscriberUnavailable } from "../ports/transcriber";
import { verifyClip } from "./verify-clip";
import { verifyConsent } from "./verify-consent";

const SCRIPTS = loadRecordingScripts(resolve(import.meta.dirname, "../../../../../content/scripts/recording-scripts.json"));
const calmScript = SCRIPTS.clips.find(({ style }) => style === "calm")?.text ?? "";

describe("recording verification", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let voiceId: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
    voiceId = await createVoiceFor(runtime, cookie);
  });

  const depsSaying = (transcript: string | Error) => ({
    consents: createConsentRepo(runtime.database),
    clips: createClipRepo(runtime.database),
    storage: runtime.storage,
    transcriber: {
      transcribe: () => (transcript instanceof Error ? Promise.reject(transcript) : Promise.resolve(transcript)),
    },
    analyzer: analyzerSaying(transcript),
    scripts: SCRIPTS,
    clock: runtime.clock,
    maxErrorRate: 0.2,
    reportFailure: () => undefined,
  });

  const submitConsent = async () => {
    const { phrase, phraseToken } = await issuePhrase(runtime, voiceId, cookie);
    const response = await postForm(runtime, `/v1/voices/${voiceId}/consent`, cookie, consentFields(phraseToken), toneRecording({ seconds: 6 }));
    expect(response.status).toBe(202);
    const [row] = await runtime.database.select().from(consentRecords).where(eq(consentRecords.status, "checking"));
    if (row?.userId == null) throw new Error("consent not stored");
    return { phrase, consentId: row.id, audioKey: consentAudioKey(row.userId, voiceId, row.id) };
  };

  const storedKeys = async () => (await runtime.storage.list("u/")).map((object) => object.key);

  const uploadClip = (audio = validClip()) => postForm(runtime, `/v1/voices/${voiceId}/clips`, cookie, clipFields(), audio);

  const activate = async () => {
    const { phrase, consentId } = await submitConsent();
    await verifyConsent(depsSaying(phrase))(consentId);
  };

  const uploadedClipRow = async () => {
    expect((await uploadClip()).status).toBe(202);
    const [clip] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.voiceProfileId, voiceId));
    if (clip === undefined) throw new Error("clip not stored");
    return clip;
  };

  describe("consent", () => {
    it("activates a correct reading, opens the gate and discards the reading", async () => {
      const { phrase, consentId, audioKey } = await submitConsent();
      expect((await uploadClip()).status).toBe(403);
      expect(await verifyConsent(depsSaying(phrase))(consentId)).toBe("passed");
      const [voice] = await runtime.database.select().from(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
      expect(voice?.activeConsentId).toBe(consentId);
      expect(await storedKeys()).not.toContain(audioKey);
      expect((await uploadClip()).status).toBe(202);
    });

    it("rejects a wrong challenge, discards the reading and allows another attempt", async () => {
      const { consentId, audioKey } = await submitConsent();
      const wrong = "저는 제 목소리로 동화를 만드는 데 동의합니다. 오늘의 확인 문구는 없는 말 입니다.";
      expect(await verifyConsent(depsSaying(wrong))(consentId)).toBe("failed");
      const [row] = await runtime.database.select().from(consentRecords).where(eq(consentRecords.id, consentId));
      expect(row?.status).toBe("revoked");
      expect(await storedKeys()).not.toContain(audioKey);
      expect((await uploadClip()).status).toBe(403);
      await submitConsent();
    });

    it("tells the parent to read again after a rejection, and clears it on the next attempt", async () => {
      const consent = async () => voiceSchema.parse(await (await runtime.app.request(`/v1/voices/${voiceId}`, { headers: { cookie } })).json());
      expect(await consent()).toMatchObject({ consent: "none", consentRejected: false });
      const { consentId } = await submitConsent();
      expect(await consent()).toMatchObject({ consent: "checking", consentRejected: false });
      await verifyConsent(depsSaying("다른 말"))(consentId);
      expect(await consent()).toMatchObject({ consent: "none", consentRejected: true });
      await submitConsent();
      expect(await consent()).toMatchObject({ consent: "checking", consentRejected: false });
    });

    it("rejects a reading whose object is gone instead of retrying forever", async () => {
      const { consentId, audioKey } = await submitConsent();
      await runtime.storage.deleteKeys([audioKey]);
      expect(await verifyConsent(depsSaying(new Error("must not transcribe")))(consentId)).toBe("failed");
      await submitConsent();
    });

    it("keeps the reading in checking when storage fails for another reason", async () => {
      const { consentId, audioKey } = await submitConsent();
      const deps = { ...depsSaying("무엇이든"), storage: { ...runtime.storage, read: () => Promise.reject(new Error("storage down")) } };
      await expect(verifyConsent(deps)(consentId)).rejects.toThrow("storage down");
      expect(await storedKeys()).toContain(audioKey);
    });

    it("keeps the reading in checking when transcription is unavailable", async () => {
      const { consentId, audioKey, phrase } = await submitConsent();
      await expect(verifyConsent(depsSaying(new TranscriberUnavailable("down")))(consentId)).rejects.toThrow("down");
      expect(await storedKeys()).toContain(audioKey);
      expect(await verifyConsent(depsSaying(phrase))(consentId)).toBe("passed");
    });

    it("is safe to run twice", async () => {
      const { phrase, consentId } = await submitConsent();
      await verifyConsent(depsSaying(phrase))(consentId);
      expect(await verifyConsent(depsSaying("다른 말"))(consentId)).toBe("skipped");
      const [row] = await runtime.database.select().from(consentRecords).where(eq(consentRecords.id, consentId));
      expect(row?.status).toBe("active");
    });

    it("skips a consent whose voice was deleted", async () => {
      const { phrase, consentId } = await submitConsent();
      await runtime.database.delete(voiceProfiles).where(eq(voiceProfiles.id, voiceId));
      await runtime.database.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.id, consentId));
      expect(await verifyConsent(depsSaying(phrase))(consentId)).toBe("skipped");
    });
  });

  describe("clip", () => {
    it("passes the script reading, stores the error rate and keeps the audio", async () => {
      await activate();
      const clip = await uploadedClipRow();
      expect(await verifyClip(depsSaying(calmScript))(clip.id)).toBe("passed");
      const [row] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.id, clip.id));
      expect(row).toMatchObject({ status: "passed", cer: 0, failure: null });
      expect(await storedKeys()).toContain(clip.storageKey);
    });

    it("fails another reading and deletes the audio", async () => {
      await activate();
      const clip = await uploadedClipRow();
      expect(await verifyClip(depsSaying("전혀 다른 내용입니다"))(clip.id)).toBe("failed");
      const [row] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.id, clip.id));
      expect(row).toMatchObject({ status: "failed", failure: "script_mismatch" });
      expect(await storedKeys()).not.toContain(clip.storageKey);
    });

    it("does not delete the audio of a clip another check already passed", async () => {
      await activate();
      const clip = await uploadedClipRow();
      const late = depsSaying("전혀 다른 내용입니다");
      const stillChecking = await late.clips.findChecking(clip.id);
      const raced = { ...late, clips: { ...late.clips, findChecking: async () => stillChecking } };
      expect(await verifyClip(depsSaying(calmScript))(clip.id)).toBe("passed");
      expect(await verifyClip(raced)(clip.id)).toBe("skipped");
      expect(await storedKeys()).toContain(clip.storageKey);
    });

    it("fails a clip whose object is gone", async () => {
      await activate();
      const clip = await uploadedClipRow();
      await runtime.storage.deleteKeys([clip.storageKey]);
      expect(await verifyClip(depsSaying(new Error("must not transcribe")))(clip.id)).toBe("failed");
      const [row] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.id, clip.id));
      expect(row).toMatchObject({ status: "failed", failure: null });
    });

    it("fails a clip whose script no longer exists without transcribing", async () => {
      await activate();
      const clip = await uploadedClipRow();
      const deps = { ...depsSaying(new Error("must not transcribe")), scripts: { clips: [], prompts: [], styleChecks: [] } };
      expect(await verifyClip(deps)(clip.id)).toBe("failed");
    });

    it("keeps the clip in checking when transcription is unavailable", async () => {
      await activate();
      const clip = await uploadedClipRow();
      await expect(verifyClip(depsSaying(new TranscriberUnavailable("down")))(clip.id)).rejects.toThrow("down");
      const rows = await runtime.database
        .select()
        .from(voiceClips)
        .where(and(eq(voiceClips.id, clip.id), eq(voiceClips.status, "checking")));
      expect(rows).toHaveLength(1);
      expect(await storedKeys()).toContain(clip.storageKey);
    });
  });
});
