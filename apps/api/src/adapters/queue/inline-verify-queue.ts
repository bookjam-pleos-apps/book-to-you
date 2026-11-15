import type { JobQueue } from "../../application/ports/job-queue";
import type { RecordingVerifier, VerifyOutcome } from "../../application/verification";

// 확인을 큐에 넣지 않고 요청 안에서 끝낸다. 삭제(purge)만 진짜 큐로 간다.
// 확인이 실패해도 업로드는 실패시키지 않는다. 행이 checking으로 남아 리컨실러가 다시 확인한다.
export const withInlineVerify = (queue: JobQueue, verify: RecordingVerifier, reportFailure: (subject: string, error: unknown) => void): JobQueue => {
  const run = async (subject: string, step: () => Promise<VerifyOutcome>): Promise<void> => {
    await step().catch((error: unknown) => reportFailure(subject, error));
  };
  return {
    enqueuePurge: () => queue.enqueuePurge(),
    enqueueVerifyConsent: (consentId) => run(`consent ${consentId}`, () => verify.consent(consentId)),
    enqueueVerifyClip: (clipId) => run(`clip ${clipId}`, () => verify.clip(clipId)),
  };
};
