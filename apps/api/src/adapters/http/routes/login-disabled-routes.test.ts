import { beforeEach, describe, expect, it } from "vitest";

import { createTestRuntime, postJson, TEST_TERMS, type TestRuntime } from "../../../testing/test-runtime";
import { otpCodes, users } from "../../db/schema";

const EMAIL = "parent@example.com";

describe("login switched off for a deployment without mail", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime({ mailer: null });
  });

  it("refuses to issue a code and writes nothing", async () => {
    const response = await postJson(runtime, "/v1/auth/otp/request", { email: EMAIL });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "login_disabled" });
    expect(await runtime.database.select().from(otpCodes)).toEqual([]);
  });

  it("refuses to verify a code, so no session can be created", async () => {
    const response = await postJson(runtime, "/v1/auth/otp/verify", { email: EMAIL, code: "123456", ...TEST_TERMS });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await runtime.database.select().from(users)).toEqual([]);
  });

  it("still publishes the current terms", async () => {
    const response = await runtime.app.request("/v1/terms");
    expect(await response.json()).toEqual(TEST_TERMS);
  });
});
