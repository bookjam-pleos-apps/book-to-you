import { describe, expect, it } from "vitest";

import { judgeOtpAttempt, MAX_OTP_ATTEMPTS, type OtpRecord } from "./otp";

const fresh: OtpRecord = { expiresAtMs: 1000, consumedAtMs: null, attempts: 0 };

describe("judgeOtpAttempt", () => {
  it("accepts a matching fresh code", () => {
    expect(judgeOtpAttempt(fresh, 999, true)).toBe("ok");
  });

  it("reports a mismatch while attempts remain", () => {
    expect(judgeOtpAttempt(fresh, 999, false)).toBe("mismatch");
  });

  it("rejects a code at the moment it expires", () => {
    expect(judgeOtpAttempt(fresh, 1000, true)).toBe("expired");
  });

  it("rejects a correct code after the attempt limit", () => {
    expect(judgeOtpAttempt({ ...fresh, attempts: MAX_OTP_ATTEMPTS }, 999, true)).toBe("too_many_attempts");
  });

  it("allows the last attempt within the limit", () => {
    expect(judgeOtpAttempt({ ...fresh, attempts: MAX_OTP_ATTEMPTS - 1 }, 999, true)).toBe("ok");
  });

  it("never accepts a code twice", () => {
    expect(judgeOtpAttempt({ ...fresh, consumedAtMs: 500 }, 999, true)).toBe("consumed");
  });
});
