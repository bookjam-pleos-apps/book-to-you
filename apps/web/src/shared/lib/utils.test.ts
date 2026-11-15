import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a token text color next to a token text size", () => {
    expect(cn("text-on-button-brand", "text-button")).toBe("text-on-button-brand text-button");
    expect(cn("text-caption", "text-ink-3")).toBe("text-caption text-ink-3");
  });

  it("still lets a later size or color win over an earlier one", () => {
    expect(cn("text-button", "text-cta")).toBe("text-cta");
    expect(cn("text-ink-2", "text-ink-3")).toBe("text-ink-3");
  });
});
