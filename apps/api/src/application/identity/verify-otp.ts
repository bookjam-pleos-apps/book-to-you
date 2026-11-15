import { judgeOtpAttempt, type OtpVerdict } from "../../domain/identity/otp";
import { otpCodeMatches } from "../../domain/identity/otp-code";
import { allowsOtpAttempts, DAY_MS, type OtpLimits } from "../../domain/identity/otp-limits";
import { isCurrentTerms } from "../../domain/terms";
import type { Clock } from "../ports/clock";
import { issueSession } from "./issue-session";
import type { AccountRepo, LiveOtp, OtpRepo, OtpStore, SessionRepo } from "./ports";

export type VerifyOtpDeps = {
  readonly otps: OtpRepo;
  readonly accounts: AccountRepo;
  readonly sessions: SessionRepo;
  readonly clock: Clock;
  readonly secret: string;
  readonly limits: OtpLimits;
  readonly sessionTtlMs: number;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
};

export type VerifyOtpInput = {
  readonly email: string;
  readonly code: string;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
};

export type VerifyOtpResult =
  | { readonly kind: "ok"; readonly sessionToken: string; readonly maxAgeSec: number; readonly userId: string }
  | { readonly kind: "terms_outdated" | "invalid_code" | "too_many_attempts" };

type Attempt = "ok" | "invalid_code" | "too_many_attempts";

const judgeLiveOtp = (deps: VerifyOtpDeps, input: VerifyOtpInput, otp: LiveOtp, now: Date): OtpVerdict =>
  judgeOtpAttempt(
    {
      expiresAtMs: otp.expiresAt.getTime(),
      consumedAtMs: otp.consumedAt?.getTime() ?? null,
      attempts: otp.attempts,
    },
    now.getTime(),
    otpCodeMatches(deps.secret, input.email, input.code, otp.codeHmac),
  );

const applyVerdict = async (store: OtpStore, otp: LiveOtp, verdict: OtpVerdict, now: Date): Promise<Attempt> => {
  if (verdict === "too_many_attempts") return "too_many_attempts";
  if (verdict === "mismatch") await store.recordFailure(otp.id);
  if (verdict !== "ok") return "invalid_code";
  await store.markConsumed(otp.id, now);
  return "ok";
};

// 읽기와 판단을 이메일 락 안에 둔다. 밖에 두면 동시 요청이 모두 attempts=0을 읽어 5회 제한이 뚫린다.
const attemptCode = (deps: VerifyOtpDeps, input: VerifyOtpInput, now: Date): Promise<Attempt> =>
  deps.otps.lockedByEmail(input.email, async (store) => {
    const failures = await store.sumFailuresSince(input.email, new Date(now.getTime() - DAY_MS));
    if (!allowsOtpAttempts(failures, deps.limits)) return "too_many_attempts";
    const otp = await store.findLive(input.email);
    if (otp === null) return "invalid_code";
    return applyVerdict(store, otp, judgeLiveOtp(deps, input, otp, now), now);
  });

const openSession = async (deps: VerifyOtpDeps, input: VerifyOtpInput, now: Date): Promise<VerifyOtpResult> => {
  const { email, termsVersion, aiNoticeVersion } = input;
  const userId = await deps.accounts.findOrRegister({ email, termsVersion, aiNoticeVersion, now });
  return { kind: "ok", userId, ...(await issueSession(deps, userId, now)) };
};

export const verifyOtp =
  (deps: VerifyOtpDeps) =>
  async (input: VerifyOtpInput): Promise<VerifyOtpResult> => {
    if (!isCurrentTerms(deps, input)) return { kind: "terms_outdated" };
    const now = deps.clock();
    const attempt = await attemptCode(deps, input, now);
    return attempt === "ok" ? openSession(deps, input, now) : { kind: attempt };
  };
