import { describe, expect, it } from "vitest";

import { ApiError } from "../../shared/api-client/api-error";
import { quickStartErrorText } from "./quick-start-errors";

describe("quickStartErrorText", () => {
  it("asks for a fresh QR when the vehicle code is no longer live", () => {
    expect(quickStartErrorText(new ApiError({ kind: "http", status: 404, code: "invalid_user_code", reasons: [] }))).toContain("QR을 다시");
  });

  it("falls back to a retry message for unknown failures", () => {
    expect(quickStartErrorText(new Error("network"))).toBe("시작하지 못했어요. 잠시 뒤에 다시 해 주세요.");
  });
});
