export const MAX_OTP_ATTEMPTS = 5;

export type OtpRecord = {
  readonly expiresAtMs: number;
  readonly consumedAtMs: number | null;
  readonly attempts: number;
};

export type OtpVerdict = "ok" | "consumed" | "expired" | "too_many_attempts" | "mismatch";

export const judgeOtpAttempt = (record: OtpRecord, nowMs: number, codeMatches: boolean): OtpVerdict => {
  if (record.consumedAtMs !== null) return "consumed";
  if (nowMs >= record.expiresAtMs) return "expired";
  if (record.attempts >= MAX_OTP_ATTEMPTS) return "too_many_attempts";
  return codeMatches ? "ok" : "mismatch";
};
