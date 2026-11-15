import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  authOptionsResponseSchema,
  meResponseSchema,
  pairStartResponseSchema,
  pairTokenResponseSchema,
} from "@voice-storybook/shared/contracts/v1";

import {
  createTestRuntime,
  inSequence,
  listDevicesOf,
  loginAs,
  postJson,
  sessionCookieOf,
  TEST_TERMS,
  type TestRuntime,
} from "../../../testing/test-runtime";
import { consentRecords, users } from "../../db/schema";

const start = async (runtime: TestRuntime) => {
  const response = await postJson(runtime, "/v1/devices/pair/start", { deviceName: "심사 차" }, { origin: "" });
  return pairStartResponseSchema.parse(await response.json());
};

const quickStart = (runtime: TestRuntime, userCode: string, terms = TEST_TERMS) =>
  postJson(runtime, "/v1/devices/pair/quick-start", { userCode, ...terms });

const poll = (runtime: TestRuntime, deviceCode: string) =>
  postJson(runtime, "/v1/devices/pair/token", { deviceCode }, { origin: "" });

const QUICK_START_ON = { QUICK_START: "enabled" };
const YEAR_SEC = 365 * 24 * 60 * 60;

const userCount = async (runtime: TestRuntime) => (await runtime.database.select().from(users)).length;

describe("quick start from the vehicle QR", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime({}, QUICK_START_ON);
  });

  it("creates an email-less account, signs the phone in and pairs the vehicle", async () => {
    const { deviceCode, userCode } = await start(runtime);
    const response = await quickStart(runtime, userCode.toLowerCase());
    expect(response.status).toBe(200);
    const me = meResponseSchema.parse(await response.json());
    expect(me.emailless).toBe(true);
    expect(response.headers.get("set-cookie")).toContain(`Max-Age=${YEAR_SEC}`);
    const cookie = sessionCookieOf(response);
    expect(meResponseSchema.parse(await (await runtime.app.request("/v1/me", { headers: { cookie } })).json())).toEqual(me);
    runtime.advance(5_000);
    expect(pairTokenResponseSchema.parse(await (await poll(runtime, deviceCode)).json()).tokenType).toBe("Bearer");
    expect(await listDevicesOf(runtime, cookie)).toMatchObject([{ name: "심사 차" }]);
  });

  it("records the terms receipt for the new account", async () => {
    const { userCode } = await start(runtime);
    const me = meResponseSchema.parse(await (await quickStart(runtime, userCode)).json());
    const receipts = await runtime.database.select().from(consentRecords).where(eq(consentRecords.userId, me.id));
    expect(receipts).toMatchObject([{ kind: "account_terms", ...TEST_TERMS }]);
  });

  it("gives every quick start its own account", async () => {
    const first = meResponseSchema.parse(await (await quickStart(runtime, (await start(runtime)).userCode)).json());
    const second = meResponseSchema.parse(await (await quickStart(runtime, (await start(runtime)).userCode)).json());
    expect(second.id).not.toBe(first.id);
  });

  it("leaves no account behind when the code is unknown or expired", async () => {
    expect((await quickStart(runtime, "ABCDEFGH")).status).toBe(404);
    const { userCode } = await start(runtime);
    runtime.advance(600_000);
    expect((await quickStart(runtime, userCode)).status).toBe(404);
    expect(await userCount(runtime)).toBe(0);
  });

  it("does not take over a code a parent already confirmed", async () => {
    const { userCode } = await start(runtime);
    const cookie = await loginAs(runtime, "parent@example.com");
    await postJson(runtime, "/v1/devices/pair/confirm", { userCode }, { cookie });
    const response = await quickStart(runtime, userCode);
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await userCount(runtime)).toBe(1);
  });

  it("refuses outdated terms", async () => {
    const { userCode } = await start(runtime);
    const response = await quickStart(runtime, userCode, { termsVersion: "old", aiNoticeVersion: "old" });
    expect(response.status).toBe(400);
    expect(await userCount(runtime)).toBe(0);
  });

  it("limits guesses per ip without using up the vehicle's pairing starts", async () => {
    await inSequence(30, () => quickStart(runtime, "ABCDEFGH"));
    expect((await quickStart(runtime, "ABCDEFGH")).status).toBe(429);
    expect((await postJson(runtime, "/v1/devices/pair/start", { deviceName: "차" })).status).toBe(200);
  });

  it("refuses a phone that is already signed in instead of replacing its session", async () => {
    const { userCode } = await start(runtime);
    const cookie = await loginAs(runtime, "parent@example.com");
    const response = await postJson(runtime, "/v1/devices/pair/quick-start", { userCode, ...TEST_TERMS }, { cookie });
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await userCount(runtime)).toBe(1);
  });

  it("tells the web that quick start and email login are on", async () => {
    const response = await runtime.app.request("/v1/auth/options");
    expect(authOptionsResponseSchema.parse(await response.json())).toEqual({ emailLogin: true, quickStart: true });
  });
});

describe("quick start turned off", () => {
  it("is not served unless the deployment turns it on", async () => {
    const runtime = await createTestRuntime({ mailer: null });
    const { userCode } = await start(runtime);
    expect((await quickStart(runtime, userCode)).status).toBe(404);
    expect(await userCount(runtime)).toBe(0);
    const options = await runtime.app.request("/v1/auth/options");
    expect(authOptionsResponseSchema.parse(await options.json())).toEqual({ emailLogin: false, quickStart: false });
  });
});
