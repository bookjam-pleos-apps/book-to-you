import { voiceSchema } from "@voice-storybook/shared/contracts/v1";
import type { Style } from "@voice-storybook/shared/vocab";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { voiceClips } from "../../adapters/db/schema";
import { hangulSyllables } from "../../domain/stories/readable-text";
import type { VoiceMeasure } from "../../domain/voices/style-check";
import { toneRecording } from "../../testing/audio-fixtures";
import { clipVerifier, scriptOf, uploadClipOf } from "../../testing/clip-verifier";
import { analyzerSaying, CALM_MEASURE, semitonesFromCalm, type CountingAnalyzer } from "../../testing/fake-clip-analyzer";
import { createTestRuntime, loginAs, type TestRuntime } from "../../testing/test-runtime";
import { createActiveVoice } from "../../testing/voices";
import { ClipAnalyzerUnavailable } from "../ports/clip-analyzer";

const MUST_NOT_ANALYZE = analyzerSaying(new Error("must not analyze"));

describe("clip style check", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let voiceId: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
    voiceId = await createActiveVoice(runtime, cookie, toneRecording({ seconds: 6 }));
  });

  const verifyWith = (analyzer: CountingAnalyzer, reportFailure: (subject: string, error: unknown) => void = () => undefined) =>
    clipVerifier(runtime, analyzer, reportFailure);

  const upload = (style: Style): Promise<string> => uploadClipOf(runtime, voiceId, cookie, style);

  const verified = async (style: Style, measure: VoiceMeasure = CALM_MEASURE) => {
    const id = await upload(style);
    return { id, outcome: await verifyWith(analyzerSaying(scriptOf(style), measure))(id) };
  };

  const rowOf = async (clipId: string) => {
    const [row] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.id, clipId));
    if (row === undefined) throw new Error("clip not stored");
    return row;
  };

  const shownFor = async (clipId: string) => {
    const voice = voiceSchema.parse(await (await runtime.app.request(`/v1/voices/${voiceId}`, { headers: { cookie } })).json());
    return voice.clips.find((clip) => clip.id === clipId);
  };

  it("stores the pitch and pace of a passed calm, the anchor for the other styles", async () => {
    const calm = await verified("calm");
    expect(calm.outcome).toBe("passed");
    expect((await rowOf(calm.id)).prosody).toEqual({ medianSemitones: 93, speechRate: hangulSyllables(scriptOf("calm")) / 12 });
  });

  it("passes a child reading three semitones above calm", async () => {
    await verified("calm");
    const child = await verified("child", semitonesFromCalm(3));
    expect(child.outcome).toBe("passed");
    expect(await shownFor(child.id)).toMatchObject({ status: "passed", failure: null, advice: null });
  });

  it("passes a child reading in the everyday voice with coaching and keeps the audio", async () => {
    await verified("calm");
    const child = await verified("child", semitonesFromCalm(1.5));
    expect(child.outcome).toBe("passed");
    expect(await rowOf(child.id)).toMatchObject({ status: "passed", failure: null, advice: "not_distinct", cer: 0 });
    expect(await shownFor(child.id)).toMatchObject({ status: "passed", failure: null, advice: "not_distinct" });
    expect((await runtime.storage.list("u/")).map(({ key }) => key)).toContain((await rowOf(child.id)).storageKey);
  });

  it("tells a wrong script apart from a voice that is not distinct", async () => {
    await verified("calm");
    const id = await upload("child");
    expect(await verifyWith(analyzerSaying("전혀 다른 내용입니다", semitonesFromCalm(5)))(id)).toBe("failed");
    expect(await shownFor(id)).toMatchObject({ status: "failed", failure: "script_mismatch", advice: null });
  });

  const adviceOf = async (style: Style, measure: VoiceMeasure) => (await rowOf((await verified(style, measure)).id)).advice;

  it("coaches a deep reading that is close to calm, not one two semitones below", async () => {
    await verified("calm");
    expect(await adviceOf("deep", semitonesFromCalm(-2.3))).toBeNull();
    expect(await adviceOf("deep", semitonesFromCalm(-1.4))).toBe("not_distinct");
  });

  it("does not coach a soft reading that is only slower than calm", async () => {
    await verified("calm", { voicedSeconds: 10, medianSemitones: 93 });
    expect(await adviceOf("soft", { voicedSeconds: 14, medianSemitones: 93.1 })).toBeNull();
    expect(await adviceOf("soft", { voicedSeconds: 10, medianSemitones: 93 })).toBe("not_distinct");
  });

  it("checks only the script for a style without criteria", async () => {
    expect((await verified("excited", semitonesFromCalm(0))).outcome).toBe("passed");
  });

  it("waits for calm, then judges from the stored measure without analyzing again", async () => {
    const child = await verified("child", semitonesFromCalm(4.5));
    expect(child.outcome).toBe("waiting");
    expect(await rowOf(child.id)).toMatchObject({ status: "checking", cer: 0 });
    expect(await verifyWith(MUST_NOT_ANALYZE)(child.id)).toBe("waiting");
    const calmId = await upload("calm");
    const calmAnalyzer = analyzerSaying(scriptOf("calm"));
    expect(await verifyWith(calmAnalyzer)(calmId)).toBe("passed");
    expect(calmAnalyzer.calls()).toBe(1);
    expect((await rowOf(child.id)).status).toBe("passed");
  });

  it("passes a waiting clip that turns out not to differ from calm, with coaching", async () => {
    const deep = await verified("deep", semitonesFromCalm(-1));
    await verified("calm");
    expect(await rowOf(deep.id)).toMatchObject({ status: "passed", failure: null, advice: "not_distinct" });
  });

  it("keeps waiting while calm fails", async () => {
    const child = await verified("child", semitonesFromCalm(4.5));
    const calmId = await upload("calm");
    expect(await verifyWith(analyzerSaying("전혀 다른 내용입니다"))(calmId)).toBe("failed");
    expect((await rowOf(child.id)).status).toBe("checking");
  });

  it("has to differ from every passed calm", async () => {
    await verified("calm");
    await verified("calm", semitonesFromCalm(2));
    expect(await adviceOf("child", semitonesFromCalm(4.5))).toBe("not_distinct");
    expect(await adviceOf("child", semitonesFromCalm(5))).toBeNull();
  });

  it("measures a calm that passed before this check existed, once", async () => {
    const calm = await verified("calm");
    await runtime.database.update(voiceClips).set({ prosody: null }).where(eq(voiceClips.id, calm.id));
    const childId = await upload("child");
    const unavailable = verifyWith(analyzerSaying(new ClipAnalyzerUnavailable("down")));
    await expect(unavailable(childId)).rejects.toThrow("down");
    expect((await rowOf(childId)).status).toBe("checking");
    const analyzer = analyzerSaying(scriptOf("child"), CALM_MEASURE);
    expect(await verifyWith(analyzer)(childId)).toBe("passed");
    expect((await rowOf(childId)).advice).toBe("not_distinct");
    expect(analyzer.calls()).toBe(2);
    expect((await rowOf(calm.id)).prosody).not.toBeNull();
  });

  it("keeps the calm verdict when a waiting clip cannot be judged yet", async () => {
    const legacyCalm = await verified("calm");
    await runtime.database.update(voiceClips).set({ prosody: null }).where(eq(voiceClips.id, legacyCalm.id));
    const childId = await upload("child");
    await runtime.database.update(voiceClips).set({ cer: 0, prosody: { medianSemitones: 97.5, speechRate: 5 } }).where(eq(voiceClips.id, childId));
    const calmId = await upload("calm");
    const calmOnly = analyzerSaying(scriptOf("calm"));
    const downAfterCalm: CountingAnalyzer = {
      analyze: (wav) => (calmOnly.calls() === 0 ? calmOnly.analyze(wav) : Promise.reject(new ClipAnalyzerUnavailable("down"))),
      calls: calmOnly.calls,
    };
    const reported = vi.fn();
    expect(await verifyWith(downAfterCalm, reported)(calmId)).toBe("passed");
    expect((await rowOf(childId)).status).toBe("checking");
    expect(reported).toHaveBeenCalledOnce();
  });
});
