import { describe, expect, it } from "vitest";

import { ApiError } from "../../shared/api-client/api-error";
import { outcomeTextOf, reportOutcomeOf } from "./report-outcome";

const httpError = (status: number) => new ApiError({ kind: "http", status, code: "x", reasons: [] });

describe("reportOutcomeOf", () => {
  it("실패가 없으면 접수됐다", () => {
    expect(reportOutcomeOf(null)).toBe("sent");
  });

  it("404는 책장에 없는 동화다", () => {
    expect(reportOutcomeOf(httpError(404))).toBe("gone");
  });

  it("그 밖의 실패는 다시 보낼 수 있다", () => {
    expect(reportOutcomeOf(httpError(500))).toBe("failed");
    expect(reportOutcomeOf(new ApiError({ kind: "network" }))).toBe("failed");
  });
});

describe("outcomeTextOf", () => {
  it("신고는 차와 같은 문구로 접수를 알린다", () => {
    expect(outcomeTextOf("sent", false).title).toBe("신고했어요");
  });

  it("내 목소리 같지 않다고 알린 것은 신고라고 하지 않는다", () => {
    expect(outcomeTextOf("sent", true).title).toBe("전달했어요");
  });

  it("실패는 무엇을 알렸든 같은 안내다", () => {
    expect(outcomeTextOf("failed", true)).toEqual(outcomeTextOf("failed", false));
  });
});
