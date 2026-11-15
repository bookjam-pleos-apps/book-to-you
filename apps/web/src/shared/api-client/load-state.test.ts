import { describe, expect, it } from "vitest";

import { isLoadFailed } from "./load-state";

describe("isLoadFailed", () => {
  it("is false while the first load is still running", () => {
    expect(isLoadFailed({ data: undefined, isError: false })).toBe(false);
  });

  it("is true when the first load failed", () => {
    expect(isLoadFailed({ data: undefined, isError: true })).toBe(true);
  });

  it("keeps showing data that a later refetch failed to refresh", () => {
    expect(isLoadFailed({ data: { voices: [] }, isError: true })).toBe(false);
  });
});
