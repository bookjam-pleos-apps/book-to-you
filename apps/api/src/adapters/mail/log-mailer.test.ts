import { describe, expect, it } from "vitest";

import { createLogMailer } from "./log-mailer";

describe("log mailer", () => {
  it("writes the code to the log instead of sending mail", async () => {
    const lines: string[] = [];
    await createLogMailer((line) => lines.push(line)).sendOtp("a@example.com", "123456");
    expect(lines).toEqual(["[dev mail] a@example.com OTP 123456"]);
  });
});
