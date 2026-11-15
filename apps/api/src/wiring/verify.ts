import type { Database } from "../adapters/db/client";
import { createClipRepo } from "../adapters/db/repos/clip-repo";
import { createConsentRepo } from "../adapters/db/repos/consent-repo";
import { createRetentionRepo } from "../adapters/db/repos/retention-repo";
import { withInlineVerify } from "../adapters/queue/inline-verify-queue";
import type { ClipAnalyzer } from "../application/ports/clip-analyzer";
import type { Clock } from "../application/ports/clock";
import type { JobQueue } from "../application/ports/job-queue";
import type { ObjectStorage } from "../application/ports/object-storage";
import type { Transcriber } from "../application/ports/transcriber";
import type { RecordingScripts } from "../application/recording-scripts";
import { verifyAllPending, verifyClip, verifyConsent, type RecordingVerifier } from "../application/verification";
import { POLICY } from "../config";

export type VerifyInfrastructure = {
  readonly database: Database;
  readonly storage: ObjectStorage;
  readonly transcriber: Transcriber;
  readonly analyzer: ClipAnalyzer;
  readonly scripts: RecordingScripts;
  readonly clock: Clock;
};

const logVerifyFailure = (subject: string, error: unknown): void => {
  console.error(`[verify] ${subject}`, error);
};

export const wireVerify = ({ database, storage, transcriber, analyzer, scripts, clock }: VerifyInfrastructure): RecordingVerifier => {
  const deps = {
    consents: createConsentRepo(database),
    clips: createClipRepo(database),
    storage,
    transcriber,
    analyzer,
    scripts,
    clock,
    maxErrorRate: POLICY.verify.maxErrorRate,
    reportFailure: logVerifyFailure,
  };
  return { consent: verifyConsent(deps), clip: verifyClip(deps) };
};

export const wireInlineVerifyQueue = (queue: JobQueue, verify: RecordingVerifier): JobQueue => withInlineVerify(queue, verify, logVerifyFailure);

export const wireVerifyPending = (database: Database, verify: RecordingVerifier) =>
  verifyAllPending({ pending: createRetentionRepo(database), verify });
