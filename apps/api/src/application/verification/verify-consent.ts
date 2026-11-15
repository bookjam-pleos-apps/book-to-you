import { judgeConsentReading } from "../../domain/voices/recording-match";
import { consentAudioKey } from "../../domain/storage-keys";
import { discardObject, settledOutcome, transcribeObject, type VerifyDeps, type VerifyOutcome } from "./verify-recording";

export const verifyConsent =
  (deps: VerifyDeps) =>
  async (consentId: string): Promise<VerifyOutcome> => {
    const pending = await deps.consents.findChecking(consentId);
    if (pending === null) return "skipped";
    const key = consentAudioKey(pending.userId, pending.voiceId, consentId);
    const transcript = await transcribeObject(deps, key);
    const match = transcript === null ? null : judgeConsentReading(pending.phrase, transcript, deps.maxErrorRate);
    const settled = match?.passed === true
      ? await deps.consents.activate(consentId, 1 - match.errorRate)
      : await deps.consents.reject(consentId, deps.clock());
    await discardObject(deps, key);
    return settledOutcome(settled, match?.passed === true);
  };
