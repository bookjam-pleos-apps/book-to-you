import { randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createOtpCode, hmacOtpCode, otpCodeMatches } from "./otp-code";

describe("otp code", () => {
  it("is always six digits", () => {
    const codes = Array.from({ length: 200 }, () => createOtpCode(randomInt));
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(createOtpCode(() => 42)).toBe("000042");
  });

  it("matches only for the same secret, email and code", () => {
    const stored = hmacOtpCode("secret", "a@example.com", "123456");
    expect(otpCodeMatches("secret", "a@example.com", "123456", stored)).toBe(true);
    expect(otpCodeMatches("secret", "a@example.com", "000000", stored)).toBe(false);
    expect(otpCodeMatches("secret", "b@example.com", "123456", stored)).toBe(false);
    expect(otpCodeMatches("other", "a@example.com", "123456", stored)).toBe(false);
  });

  it("does not store the code in the clear", () => {
    expect(hmacOtpCode("secret", "a@example.com", "123456")).not.toContain("123456");
  });
});
