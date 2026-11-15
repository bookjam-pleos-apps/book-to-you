import { describe, expect, it } from "vitest";

import { POLICY } from "../../apps/api/src/config";
import { createUserCode, normalizeUserCode } from "../../apps/api/src/domain/devices/user-code";
import { isCompletePairCode, normalizePairCode } from "../../apps/web/src/features/devices/pair-code";
import { limitFor } from "../../apps/web/src/features/voices/record/recording-limits";

// 웹은 apps/api를 import하지 않으므로 서버 규칙을 복사해 둔다. 계약으로 옮기기 전까지 이 테스트가 둘을 묶는다.
const ALPHABET_SIZE = 32;
const CODES_COVERING_ALPHABET = ALPHABET_SIZE / 8;

const sequentialRandom = () => {
  const state = { next: 0 };
  return (max: number): number => state.next++ % max;
};

describe("web copies of server rules", () => {
  it("uses the server's recording duration limits", () => {
    expect(limitFor("clip")).toEqual(POLICY.duration.clip);
    expect(limitFor("consent")).toEqual(POLICY.duration.consent);
    expect(limitFor("prompt")).toEqual(POLICY.duration.prompt);
  });

  it("accepts every pair code the server can issue", () => {
    const random = sequentialRandom();
    const codes = Array.from({ length: CODES_COVERING_ALPHABET }, () => createUserCode(random));
    expect(codes.every(isCompletePairCode)).toBe(true);
  });

  it("normalizes typed codes the same way as the server", () => {
    const typed = ["abcd-2345", " ABCD 2345 ", "ab.cd_23-45"];
    expect(typed.map(normalizePairCode)).toEqual(typed.map(normalizeUserCode));
  });
});
