import type { Style } from "@voice-storybook/shared/vocab";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { pendingPurges, voiceClips } from "../../adapters/db/schema";
import type { VoiceMeasure } from "../../domain/voices/style-check";
import { toneRecording } from "../../testing/audio-fixtures";
import { clipVerifier, scriptOf, uploadClipOf } from "../../testing/clip-verifier";
import { analyzerSaying, CALM_MEASURE, semitonesFromCalm } from "../../testing/fake-clip-analyzer";
import { createTestRuntime, loginAs, type TestRuntime } from "../../testing/test-runtime";
import { createActiveVoice } from "../../testing/voices";

const COACHED = semitonesFromCalm(1.5);
const DISTINCT = semitonesFromCalm(3);

describe("retake after coaching", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let voiceId: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
    voiceId = await createActiveVoice(runtime, cookie, toneRecording({ seconds: 6 }));
  });

  const verified = async (style: Style, measure: VoiceMeasure = CALM_MEASURE, said: string = scriptOf(style)) => {
    const id = await uploadClipOf(runtime, voiceId, cookie, style);
    const outcome = await clipVerifier(runtime, analyzerSaying(said, measure))(id);
    const [row] = await runtime.database.select().from(voiceClips).where(eq(voiceClips.id, id));
    return { id, outcome, storageKey: row?.storageKey };
  };

  const passedOf = async (style: Style) => {
    const rows = await runtime.database.select().from(voiceClips).where(eq(voiceClips.style, style));
    return rows.filter((row) => row.status === "passed").map((row) => row.id);
  };

  const purgePrefixes = async () => (await runtime.database.select().from(pendingPurges)).map((purge) => purge.storagePrefix);

  it("replaces the coached take when the retake passes, so a render still finds one clip", async () => {
    await verified("calm");
    const first = await verified("child", COACHED);
    const retake = await verified("child", DISTINCT);
    expect(await passedOf("child")).toEqual([retake.id]);
    expect(await purgePrefixes()).toContain(first.storageKey);
  });

  it("replaces the coached take with a retake that is coached again", async () => {
    await verified("calm");
    await verified("child", COACHED);
    const retake = await verified("child", COACHED);
    expect(await passedOf("child")).toEqual([retake.id]);
  });

  it("keeps the coached take when the retake misreads the script", async () => {
    await verified("calm");
    const first = await verified("child", COACHED);
    expect((await verified("child", DISTINCT, "전혀 다른 내용입니다")).outcome).toBe("failed");
    expect(await passedOf("child")).toEqual([first.id]);
    expect(await purgePrefixes()).not.toContain(first.storageKey);
  });

  it("replaces a passed take without coaching when the retake is coached, so the newest reading wins", async () => {
    await verified("calm");
    await verified("child", DISTINCT);
    const retake = await verified("child", COACHED);
    expect(await passedOf("child")).toEqual([retake.id]);
  });

  it("leaves two passed takes without coaching and the other styles alone", async () => {
    await verified("calm");
    const child = await verified("child", DISTINCT);
    const deep = await verified("deep", semitonesFromCalm(-1));
    const retake = await verified("child", DISTINCT);
    expect(await passedOf("child")).toEqual(expect.arrayContaining([child.id, retake.id]));
    expect(await passedOf("deep")).toEqual([deep.id]);
  });
});
