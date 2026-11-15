import { describe, expect, it } from "vitest";

import { agreeToAll, isAllAgreed, toggleAgreement } from "./agreements";

describe("agreements", () => {
  it("모두 동의를 켜면 세 항목이 모두 체크되고, 끄면 모두 풀린다", () => {
    expect(isAllAgreed(agreeToAll(true))).toBe(true);
    expect(agreeToAll(false).size).toBe(0);
  });

  it("한 항목을 풀면 모두 동의도 풀린다", () => {
    expect(isAllAgreed(toggleAgreement(agreeToAll(true), "ai", false))).toBe(false);
  });

  it("하나씩 모두 체크해도 모두 동의가 된다", () => {
    const agreed = (["terms", "ai", "guardian"] as const).reduce((current, id) => toggleAgreement(current, id, true), agreeToAll(false));
    expect(isAllAgreed(agreed)).toBe(true);
  });
});
