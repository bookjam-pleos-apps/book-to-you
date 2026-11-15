import { describe, expect, it } from "vitest";

import { isQuickStartEmail, quickStartEmail } from "./quick-start-email";

describe("quick start email", () => {
  it("recognizes the address it makes", () => {
    expect(isQuickStartEmail(quickStartEmail("3f2a"))).toBe(true);
  });

  it("does not mistake the demo account or a real address for a quick start account", () => {
    expect(isQuickStartEmail("demo@voice-storybook.invalid")).toBe(false);
    expect(isQuickStartEmail("parent@example.com")).toBe(false);
  });
});
