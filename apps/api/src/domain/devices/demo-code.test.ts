import { describe, expect, it } from "vitest";

import { hashDemoCode, isRedeemableDemoCode, type DemoPairing } from "./demo-code";

const CODE = "demo-7Kq2-Xv9p-Lm4r";
const UNTIL_MS = Date.parse("2026-12-05T00:00:00+09:00");
const DEMO: DemoPairing = { codeHash: hashDemoCode(CODE), userId: "00000000-0000-4000-8000-000000000001", untilMs: UNTIL_MS };
const BEFORE = UNTIL_MS - 1;

describe("demo pairing code", () => {
  it("accepts the configured code before the demo ends", () => {
    expect(isRedeemableDemoCode(DEMO, CODE, BEFORE)).toBe(true);
  });

  it("rejects a wrong code, including one that only shares a prefix", () => {
    expect(isRedeemableDemoCode(DEMO, "demo-7Kq2-Xv9p-Lm4", BEFORE)).toBe(false);
    expect(isRedeemableDemoCode(DEMO, `${CODE}x`, BEFORE)).toBe(false);
    expect(isRedeemableDemoCode(DEMO, "", BEFORE)).toBe(false);
  });

  it("does not trim or fold case, so the code is compared exactly", () => {
    expect(isRedeemableDemoCode(DEMO, ` ${CODE}`, BEFORE)).toBe(false);
    expect(isRedeemableDemoCode(DEMO, CODE.toUpperCase(), BEFORE)).toBe(false);
  });

  it("stops accepting the code once the demo period is over", () => {
    expect(isRedeemableDemoCode(DEMO, CODE, UNTIL_MS)).toBe(false);
    expect(isRedeemableDemoCode(DEMO, CODE, UNTIL_MS + 1)).toBe(false);
  });
});
