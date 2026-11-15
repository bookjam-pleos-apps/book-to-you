import { randomInt } from "node:crypto";

import { createOtpCode, hmacOtpCode } from "../../domain/identity/otp-code";
import { allowsOtpAttempts, allowsOtpRequest, DAY_MS, HOUR_MS, type OtpLimits } from "../../domain/identity/otp-limits";
import type { Clock } from "../ports/clock";
import type { Mailer } from "../ports/mailer";
import type { OtpRepo } from "./ports";

export type RequestOtpDeps = {
  readonly otps: OtpRepo;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly secret: string;
  readonly ttlMs: number;
  readonly limits: OtpLimits;
};

export type RequestOtpResult = { readonly kind: "sent" } | { readonly kind: "rate_limited" };

const issueCode = ({ otps, clock, secret, ttlMs, limits }: RequestOtpDeps, email: string): Promise<string | null> =>
  otps.lockedByEmail(email, async (store) => {
    const now = clock();
    const requests = await store.countRequestsSince(email, new Date(now.getTime() - HOUR_MS));
    const failures = await store.sumFailuresSince(email, new Date(now.getTime() - DAY_MS));
    if (!allowsOtpRequest(requests, limits) || !allowsOtpAttempts(failures, limits)) return null;
    const code = createOtpCode(randomInt);
    await store.invalidateLive(email, now);
    await store.insert({
      email,
      codeHmac: hmacOtpCode(secret, email, code),
      expiresAt: new Date(now.getTime() + ttlMs),
      createdAt: now,
    });
    return code;
  });

export const requestOtp =
  (deps: RequestOtpDeps) =>
  async (email: string): Promise<RequestOtpResult> => {
    const code = await issueCode(deps, email);
    if (code === null) return { kind: "rate_limited" };
    await deps.mailer.sendOtp(email, code);
    return { kind: "sent" };
  };
