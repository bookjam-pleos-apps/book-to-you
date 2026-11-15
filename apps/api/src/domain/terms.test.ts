import { describe, expect, it } from "vitest";

import { isCurrentTerms } from "./terms";

const CURRENT = { termsVersion: "2026-11", aiNoticeVersion: "2026-11" };

describe("isCurrentTerms", () => {
  it("accepts the versions the server serves now", () => {
    expect(isCurrentTerms(CURRENT, { ...CURRENT })).toBe(true);
  });

  it("rejects an outdated terms or AI notice version", () => {
    expect(isCurrentTerms(CURRENT, { ...CURRENT, termsVersion: "2026-10" })).toBe(false);
    expect(isCurrentTerms(CURRENT, { ...CURRENT, aiNoticeVersion: "2026-10" })).toBe(false);
  });
});
