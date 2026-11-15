import { randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createUserCode, normalizeUserCode } from "./user-code";

describe("user code", () => {
  it("has eight characters and no confusable ones", () => {
    const codes = Array.from({ length: 200 }, () => createUserCode(randomInt));
    expect(codes.every((code) => /^[2-9A-HJ-NP-Z]{8}$/.test(code))).toBe(true);
  });

  it("accepts lower case and separators a person may type", () => {
    expect(normalizeUserCode("abcd-efgh ")).toBe("ABCDEFGH");
  });
});
