import { beforeEach, describe, expect, it } from "vitest";

import { DAY_MS } from "../../../domain/identity/otp-limits";
import { createTestRuntime, postJson, TEST_DEMO_ENV, type TestRuntime } from "../../../testing/test-runtime";
import { devicePairings, devices, users } from "../../db/schema";

const { DEMO_PAIRING_CODE: DEMO_CODE, DEMO_USER_ID } = TEST_DEMO_ENV;

const redeem = (runtime: TestRuntime, demoCode: string) =>
  postJson(runtime, "/v1/devices/pair/demo", { deviceName: "심사 에뮬레이터", demoCode }, { origin: "" });

const tokenOf = async (response: Response): Promise<string> => {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("accessToken" in body)) throw new Error("no token");
  return String(body.accessToken);
};

describe("demo code pairing", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime({}, TEST_DEMO_ENV);
    await runtime.database.insert(users).values({ id: DEMO_USER_ID, email: "demo@storybook.example" });
  });

  it("pairs a vehicle with the demo account using the published code", async () => {
    const response = await redeem(runtime, DEMO_CODE);
    expect(response.status).toBe(200);
    const token = await tokenOf(response);
    const [device] = await runtime.database.select().from(devices);
    expect(device?.userId).toBe(DEMO_USER_ID);
    const headers = { authorization: `Bearer ${token}` };
    expect((await runtime.app.request("/v1/library/manifest", { headers })).status).toBe(200);
    expect((await runtime.app.request("/v1/voices", { headers })).status).toBe(403);
  });

  it("gives each vehicle its own device so one can be revoked alone", async () => {
    await redeem(runtime, DEMO_CODE);
    await redeem(runtime, DEMO_CODE);
    expect(await runtime.database.select().from(devices)).toHaveLength(2);
  });

  it("rejects a wrong code without creating a device", async () => {
    const response = await redeem(runtime, "demo-wrong-code-0000");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_demo_code" });
    expect(await runtime.database.select().from(devices)).toEqual([]);
  });

  it("reports the demo as not ready when the demo account is gone, leaving no pairing behind", async () => {
    await runtime.database.delete(users);
    const response = await redeem(runtime, DEMO_CODE);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_not_ready" });
    expect(await runtime.database.select().from(devicePairings)).toEqual([]);
  });

  it("stops pairing once the demo period is over", async () => {
    runtime.advance(DAY_MS);
    expect((await redeem(runtime, DEMO_CODE)).status).toBe(400);
  });
});

describe("demo code pairing on a deployment without a demo code", () => {
  it("answers as if the route did not exist", async () => {
    const runtime = await createTestRuntime();
    const response = await redeem(runtime, DEMO_CODE);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
