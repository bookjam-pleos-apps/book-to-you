import { describe, expect, it } from "vitest";

import { sameSecretText } from "./constant-time";

describe("secret text comparison", () => {
  it("matches only identical text", () => {
    expect(sameSecretText("abc123", "abc123")).toBe(true);
    expect(sameSecretText("abc123", "abc124")).toBe(false);
  });

  it("returns false instead of throwing when the lengths differ", () => {
    expect(sameSecretText("abc", "abcd")).toBe(false);
    expect(sameSecretText("", "a")).toBe(false);
  });
});
