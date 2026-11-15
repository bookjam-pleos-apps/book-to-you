import { describe, expect, it } from "vitest";

import { ApiError, toHttpFailure } from "../shared/api-client/api-error";
import { QUERY_KEYS } from "../shared/api-client/query-keys";
import { createQueryClient, isSessionLost } from "./query-client";

const failWith = (status: number) => new ApiError(toHttpFailure(status, { error: "x" }));

const runFailingMutation = async (status: number) => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(QUERY_KEYS.me, { id: "u1", email: "a@b.c", emailless: false });
  const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: () => Promise.reject(failWith(status)) });
  await mutation.execute(undefined).catch(() => undefined);
  return queryClient.getQueryState(QUERY_KEYS.me)?.isInvalidated;
};

describe("isSessionLost", () => {
  it("401만 로그인이 풀린 것으로 본다", () => {
    expect(isSessionLost(failWith(401))).toBe(true);
    expect(isSessionLost(failWith(403))).toBe(false);
    expect(isSessionLost(new ApiError({ kind: "network" }))).toBe(false);
    expect(isSessionLost(new Error("boom"))).toBe(false);
  });
});

describe("createQueryClient", () => {
  it("요청이 401로 실패하면 세션을 다시 받게 한다", async () => {
    expect(await runFailingMutation(401)).toBe(true);
  });

  it("다른 실패로는 세션을 건드리지 않는다", async () => {
    expect(await runFailingMutation(500)).toBe(false);
  });
});
