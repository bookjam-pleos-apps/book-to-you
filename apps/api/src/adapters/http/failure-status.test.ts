import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { FAILURE_STATUS, failureCodeResponse } from "./failure-status";

describe("failureCodeResponse", () => {
  it.each([
    ["invalid_request", 400],
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["not_found", 404],
    ["already_live", 409],
    ["upload_too_large", 413],
    ["unreadable", 422],
    ["too_many_requests", 429],
    ["internal_error", 500],
    ["login_disabled", 503],
  ] as const)("%s는 %i과 코드 본문으로 나간다", async (code, status) => {
    const app = new Hono().get("/", (c) => failureCodeResponse(c, code));

    const response = await app.request("/");

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it("표의 상태는 모두 오류 상태다", () => {
    expect(Object.values(FAILURE_STATUS).every((status) => status >= 400 && status < 600)).toBe(true);
  });
});
