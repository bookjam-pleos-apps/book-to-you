import { describe, expect, it } from "vitest";

import { ApiError, toHttpFailure } from "../../shared/api-client/api-error";
import { makeFailureOf } from "./make-failure";

const httpError = (status: number, error: string) => new ApiError(toHttpFailure(status, { error }));

describe("makeFailureOf", () => {
  it("대기 중인 동화가 많으면 끝난 뒤 다시 누르게 한다", () => {
    expect(makeFailureOf(httpError(429, "too_many_pending"))).toEqual({ body: "만드는 중인 동화가 끝나면 다시 눌러 주세요.", retryable: true });
  });

  it("다시 눌러도 안 되는 이유면 버튼을 숨긴다", () => {
    const codes: readonly [number, string][] = [[409, "no_passed_clip"], [409, "ambiguous_clip"], [422, "unrenderable_line"], [403, "no_active_consent"], [404, "not_found"]];
    expect(codes.map(([status, code]) => makeFailureOf(httpError(status, code)).retryable)).toEqual([false, false, false, false, false]);
  });

  it("그 밖의 실패는 잠시 뒤에 다시 하게 한다", () => {
    expect(makeFailureOf(new ApiError({ kind: "network" }))).toEqual({ body: "잠시 뒤에 다시 해 주세요.", retryable: true });
    expect(makeFailureOf(httpError(500, "internal"))).toEqual({ body: "잠시 뒤에 다시 해 주세요.", retryable: true });
  });

  it("코드 없는 403(csrf 거절 등)은 동의 안내로 오해하지 않는다", () => {
    expect(makeFailureOf(new ApiError(toHttpFailure(403, "Forbidden")))).toEqual({ body: "잠시 뒤에 다시 해 주세요.", retryable: true });
  });
});
