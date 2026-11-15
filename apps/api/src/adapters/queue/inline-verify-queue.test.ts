import { describe, expect, it, vi } from "vitest";

import type { JobQueue } from "../../application/ports/job-queue";
import { withInlineVerify } from "./inline-verify-queue";

const queue: JobQueue = {
  enqueuePurge: vi.fn(async () => undefined),
  enqueueVerifyClip: () => Promise.reject(new Error("verify must not go through the queue")),
  enqueueVerifyConsent: () => Promise.reject(new Error("verify must not go through the queue")),
};

describe("inline verify", () => {
  it("runs verification inside the call and leaves purge on the real queue", async () => {
    const consent = vi.fn(async () => "passed" as const);
    const clip = vi.fn(async () => "failed" as const);
    const inline = withInlineVerify(queue, { consent, clip }, () => undefined);
    await inline.enqueueVerifyConsent("c1");
    await inline.enqueueVerifyClip("k1");
    await inline.enqueuePurge();
    expect(consent).toHaveBeenCalledWith("c1");
    expect(clip).toHaveBeenCalledWith("k1");
    expect(queue.enqueuePurge).toHaveBeenCalledOnce();
  });

  it("does not fail the upload when transcription fails", async () => {
    const reported = vi.fn();
    const down = { consent: () => Promise.reject(new Error("gpu down")), clip: () => Promise.reject(new Error("gpu down")) };
    const failing = withInlineVerify(queue, down, reported);
    await expect(failing.enqueueVerifyConsent("c1")).resolves.toBeUndefined();
    await expect(failing.enqueueVerifyClip("k1")).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalledTimes(2);
  });
});
