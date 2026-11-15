import type { PendingChecks } from "./ports";
import type { RecordingVerifier } from "./verify-recording";

export type PendingVerifySummary = {
  readonly passed: number;
  readonly failed: number;
  // 대본은 맞았지만 통과한 calm이 없어 판정을 미룬 녹음이다. calm이 통과하면 판정된다.
  readonly waiting: number;
  readonly unavailable: number;
  readonly errors: readonly string[];
};

export type VerifyPendingDeps = {
  readonly pending: PendingChecks;
  readonly verify: RecordingVerifier;
};

// GPU가 내려가 checking으로 남은 녹음을 운영자가 다시 확인한다. 리컨실러를 기다리지 않아도 된다.
export const verifyAllPending =
  ({ pending, verify }: VerifyPendingDeps) =>
  async (): Promise<PendingVerifySummary> => {
    const { clipIds, consentIds } = await pending.listChecking();
    const results = await Promise.allSettled([...consentIds.map(verify.consent), ...clipIds.map(verify.clip)]);
    const outcomes = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    return {
      passed: outcomes.filter((outcome) => outcome === "passed").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
      waiting: outcomes.filter((outcome) => outcome === "waiting").length,
      unavailable: results.length - outcomes.length,
      errors: results.flatMap((result) => (result.status === "rejected" ? [String(result.reason)] : [])),
    };
  };
