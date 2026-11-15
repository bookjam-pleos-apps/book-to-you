import { randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createConsentPhrase } from "./consent-phrase";

describe("createConsentPhrase", () => {
  it("varies so an old recording cannot be replayed", () => {
    const phrases = new Set(Array.from({ length: 50 }, () => createConsentPhrase(randomInt)));
    expect(phrases.size).toBeGreaterThan(1);
  });

  it("states consent and includes the picked words", () => {
    expect(createConsentPhrase(() => 0)).toBe(
      "저는 제 목소리로 동화를 만드는 데 동의합니다. 오늘의 확인 문구는 파란 사과 두 개입니다.",
    );
  });
});
