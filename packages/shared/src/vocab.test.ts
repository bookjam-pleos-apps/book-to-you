import { describe, expect, it } from "vitest";

import { isStyle, STYLES } from "./vocab";

describe("isStyle", () => {
  it("accepts every declared style", () => {
    expect(STYLES.every(isStyle)).toBe(true);
  });

  it("rejects a style outside the vocabulary", () => {
    expect(isStyle("shouting")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isStyle(1)).toBe(false);
  });
});
