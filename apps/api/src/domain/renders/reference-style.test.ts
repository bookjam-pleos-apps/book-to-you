import { describe, expect, it } from "vitest";

import { resolveReferenceStyle } from "./reference-style";

describe("resolveReferenceStyle", () => {
  it("uses the wanted style when its clip exists", () => {
    expect(resolveReferenceStyle("excited", new Set(["calm", "excited"]))).toBe("excited");
  });

  it("falls back to calm when the wanted clip is missing", () => {
    expect(resolveReferenceStyle("excited", new Set(["calm"]))).toBe("calm");
  });

  it("returns null when neither the wanted style nor calm exists", () => {
    expect(resolveReferenceStyle("excited", new Set(["soft"]))).toBeNull();
  });
});
