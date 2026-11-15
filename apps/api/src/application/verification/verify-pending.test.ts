import { describe, expect, it } from "vitest";

import { createRetentionRepo } from "../../adapters/db/repos/retention-repo";
import { toneRecording } from "../../testing/audio-fixtures";
import { createTestRuntime, loginAs, type TestRuntime } from "../../testing/test-runtime";
import { createVoiceFor, submitConsentFor } from "../../testing/voices";
import { verifyAllPending } from "./verify-pending";
import type { RecordingVerifier } from "./verify-recording";

const verifyPending = (runtime: TestRuntime, verify: RecordingVerifier) =>
  verifyAllPending({ pending: createRetentionRepo(runtime.database), verify })();

describe("verify all pending", () => {
  it("counts what is still waiting so an operator can see a transcriber outage", async () => {
    const runtime = await createTestRuntime();
    const cookie = await loginAs(runtime, "parent@example.com");
    const voiceId = await createVoiceFor(runtime, cookie);
    await submitConsentFor(runtime, voiceId, cookie, toneRecording({ seconds: 6 }));
    const clip = () => Promise.resolve("skipped" as const);
    const down = { consent: () => Promise.reject(new Error("gpu down")), clip };
    expect(await verifyPending(runtime, down)).toEqual({ passed: 0, failed: 0, waiting: 0, unavailable: 1, errors: ["Error: gpu down"] });
    const up = { consent: () => Promise.resolve("passed" as const), clip };
    expect(await verifyPending(runtime, up)).toEqual({ passed: 1, failed: 0, waiting: 0, unavailable: 0, errors: [] });
  });

  it("counts a recording that waits for calm apart from an outage", async () => {
    const runtime = await createTestRuntime();
    const cookie = await loginAs(runtime, "parent@example.com");
    const voiceId = await createVoiceFor(runtime, cookie);
    await submitConsentFor(runtime, voiceId, cookie, toneRecording({ seconds: 6 }));
    const waiting = { consent: () => Promise.resolve("waiting" as const), clip: () => Promise.resolve("skipped" as const) };
    expect(await verifyPending(runtime, waiting)).toEqual({ passed: 0, failed: 0, waiting: 1, unavailable: 0, errors: [] });
  });
});
