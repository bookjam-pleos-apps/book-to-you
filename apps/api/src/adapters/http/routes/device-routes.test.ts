import { beforeEach, describe, expect, it } from "vitest";

import { pairStartResponseSchema, pairTokenErrorSchema, pairTokenResponseSchema } from "@voice-storybook/shared/contracts/v1";

import {
  createTestRuntime,
  deleteAs,
  inSequence,
  listDevicesOf,
  loginAs,
  pairVehicle,
  postJson,
  type TestRuntime,
} from "../../../testing/test-runtime";
import { devices } from "../../db/schema";

const NO_BROWSER_HEADERS = { "content-type": "application/json" };

const start = async (runtime: TestRuntime) => {
  const response = await runtime.app.request("/v1/devices/pair/start", {
    method: "POST",
    headers: NO_BROWSER_HEADERS,
    body: JSON.stringify({ deviceName: "내 차" }),
  });
  expect(response.status).toBe(200);
  return pairStartResponseSchema.parse(await response.json());
};

const poll = (runtime: TestRuntime, deviceCode: string) =>
  runtime.app.request("/v1/devices/pair/token", {
    method: "POST",
    headers: NO_BROWSER_HEADERS,
    body: JSON.stringify({ deviceCode }),
  });

const pollError = async (runtime: TestRuntime, deviceCode: string) => {
  const response = await poll(runtime, deviceCode);
  expect(response.status).toBe(400);
  return pairTokenErrorSchema.parse(await response.json()).error;
};

const confirm = (runtime: TestRuntime, userCode: string, cookie: string) =>
  postJson(runtime, "/v1/devices/pair/confirm", { userCode }, { cookie });

describe("device pairing", () => {
  let runtime: TestRuntime;
  let cookie: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
  });

  it("issues an eight character code the parent types and the vehicle polls with", async () => {
    const started = await start(runtime);
    expect(started.userCode).toHaveLength(8);
    expect(started.verificationUri).toBe("https://storybook.example/pair");
    expect(started).toMatchObject({ expiresInSec: 600, intervalSec: 5 });
  });

  it("completes pairing and returns a body-less 204 on confirm", async () => {
    const { deviceCode, userCode } = await start(runtime);
    expect(await pollError(runtime, deviceCode)).toBe("authorization_pending");
    const confirmed = await confirm(runtime, userCode.toLowerCase(), cookie);
    expect(confirmed.status).toBe(204);
    expect(await confirmed.text()).toBe("");
    const issued = await poll(runtime, deviceCode);
    expect(pairTokenResponseSchema.parse(await issued.json()).tokenType).toBe("Bearer");
  });

  it("tells a fast poller to slow down and recovers after the interval", async () => {
    const { deviceCode } = await start(runtime);
    expect(await pollError(runtime, deviceCode)).toBe("authorization_pending");
    expect(await pollError(runtime, deviceCode)).toBe("slow_down");
    runtime.advance(5_000);
    expect(await pollError(runtime, deviceCode)).toBe("authorization_pending");
  });

  it("issues the token only once", async () => {
    const { deviceCode, userCode } = await start(runtime);
    await confirm(runtime, userCode, cookie);
    expect((await poll(runtime, deviceCode)).status).toBe(200);
    expect(await pollError(runtime, deviceCode)).toBe("invalid_grant");
    expect(await runtime.database.select().from(devices)).toHaveLength(1);
  });

  it("expires an unconfirmed pairing", async () => {
    const { deviceCode, userCode } = await start(runtime);
    runtime.advance(600_000);
    expect(await pollError(runtime, deviceCode)).toBe("expired_token");
    expect((await confirm(runtime, userCode, cookie)).status).toBe(404);
  });

  it("rejects an unknown device code", async () => {
    expect(await pollError(runtime, "unknown")).toBe("invalid_grant");
  });

  it("does not let a second parent take over a confirmed code", async () => {
    const { userCode } = await start(runtime);
    await confirm(runtime, userCode, cookie);
    const other = await loginAs(runtime, "other@example.com");
    expect((await confirm(runtime, userCode, other)).status).toBe(404);
  });

  it("requires a session to confirm", async () => {
    const { userCode } = await start(runtime);
    const response = await postJson(runtime, "/v1/devices/pair/confirm", { userCode });
    expect(response.status).toBe(401);
  });

  it("stores neither the device code nor the access token in the clear", async () => {
    const { deviceCode, userCode } = await start(runtime);
    await confirm(runtime, userCode, cookie);
    const { accessToken } = pairTokenResponseSchema.parse(await (await poll(runtime, deviceCode)).json());
    const [device] = await runtime.database.select().from(devices);
    expect(device?.tokenHash).not.toBe(accessToken);
    expect(device?.scope).toBe("library:read");
  });

  it("limits pairing starts per ip", async () => {
    await inSequence(30, () => postJson(runtime, "/v1/devices/pair/start", { deviceName: "차" }));
    expect((await postJson(runtime, "/v1/devices/pair/start", { deviceName: "차" })).status).toBe(429);
  });
});

describe("device management", () => {
  let runtime: TestRuntime;
  let cookie: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
  });

  const firstDeviceId = async (): Promise<string> => (await listDevicesOf(runtime, cookie))[0]?.id ?? "";

  it("lists the parent's own live devices", async () => {
    await pairVehicle(runtime, cookie, "우리 차");
    const other = await loginAs(runtime, "other@example.com");
    expect(await listDevicesOf(runtime, cookie)).toMatchObject([{ name: "우리 차", lastSeenAt: null }]);
    expect(await listDevicesOf(runtime, other)).toEqual([]);
  });

  it("revokes a device and hides it from the list", async () => {
    await pairVehicle(runtime, cookie);
    const response = await deleteAs(runtime, `/v1/devices/${await firstDeviceId()}`, cookie);
    expect(response.status).toBe(204);
    expect(await listDevicesOf(runtime, cookie)).toEqual([]);
  });

  it("does not let another parent revoke a device", async () => {
    await pairVehicle(runtime, cookie);
    const other = await loginAs(runtime, "other@example.com");
    const response = await deleteAs(runtime, `/v1/devices/${await firstDeviceId()}`, other);
    expect(response.status).toBe(404);
    expect(await listDevicesOf(runtime, cookie)).toHaveLength(1);
  });

  it("answers 404 for a malformed id instead of a database error", async () => {
    expect((await deleteAs(runtime, "/v1/devices/not-a-uuid", cookie)).status).toBe(404);
  });
});
