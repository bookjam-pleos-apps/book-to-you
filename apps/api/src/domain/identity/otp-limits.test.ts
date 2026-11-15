import { describe, expect, it } from "vitest";

import { allowsOtpAttempts, allowsOtpRequest } from "./otp-limits";

const LIMITS = { requestsPerHour: 5, failuresPerDay: 20 };

describe("otp limits", () => {
  it("allows requests up to the hourly limit", () => {
    expect(allowsOtpRequest(4, LIMITS)).toBe(true);
    expect(allowsOtpRequest(5, LIMITS)).toBe(false);
  });

  it("allows attempts up to the daily failure limit", () => {
    expect(allowsOtpAttempts(19, LIMITS)).toBe(true);
    expect(allowsOtpAttempts(20, LIMITS)).toBe(false);
  });
});
