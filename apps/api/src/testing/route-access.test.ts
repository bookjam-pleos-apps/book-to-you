import { beforeAll, describe, expect, it } from "vitest";

import { deviceRoutes, publicRoutes } from "../adapters/http/access-policy";
import {
  createTestRuntime,
  deleteAs,
  listDevicesOf,
  loginAs,
  pairVehicle,
  TEST_DEMO_ENV,
  TEST_ORIGIN,
  type TestRuntime,
} from "./test-runtime";

const handlerRoutes = (runtime: TestRuntime) =>
  runtime.app.routes.filter((route) => route.method !== "ALL" && !route.path.includes("*"));

const routeKeys = (runtime: TestRuntime): readonly string[] =>
  handlerRoutes(runtime).map((route) => `${route.method} ${route.path}`);

const callRoute = (runtime: TestRuntime, key: string, headers: Record<string, string>) => {
  const [method = "GET", path = "/"] = key.split(" ");
  const concrete = path.replaceAll(/:\w+/g, "00000000-0000-4000-8000-000000000000");
  const body = method === "GET" ? {} : { body: "{}" };
  return runtime.app.request(concrete, {
    method,
    headers: { "content-type": "application/json", origin: TEST_ORIGIN, ...headers },
    ...body,
  });
};

describe("default deny", () => {
  let runtime: TestRuntime;

  // 데모 코드와 바로 시작하기 경로는 설정이 있을 때만 등록되므로, 모든 경로를 보려고 둘 다 켜서 띄운다.
  beforeAll(async () => {
    runtime = await createTestRuntime({}, { ...TEST_DEMO_ENV, QUICK_START: "enabled" });
  });

  it("lists only routes that exist", () => {
    const registered = routeKeys(runtime);
    expect(registered).toEqual(expect.arrayContaining([...publicRoutes(), ...deviceRoutes()]));
  });

  it("rejects anonymous callers on every route that is not public", async () => {
    const guarded = routeKeys(runtime).filter((key) => !publicRoutes().includes(key));
    const statuses = await Promise.all(guarded.map((key) => callRoute(runtime, key, {})));
    expect(Object.fromEntries(guarded.map((key, index) => [key, statuses[index]?.status]))).toEqual(
      Object.fromEntries(guarded.map((key) => [key, 401])),
    );
  });

  it("forbids a device token on every route except its allow list", async () => {
    const cookie = await loginAs(runtime, "device-owner@example.com");
    const token = await pairVehicle(runtime, cookie);
    const denied = routeKeys(runtime).filter((key) => !deviceRoutes().includes(key));
    const headers = { authorization: `Bearer ${token}` };
    const statuses = await Promise.all(denied.map((key) => callRoute(runtime, key, headers)));
    expect(Object.fromEntries(denied.map((key, index) => [key, statuses[index]?.status]))).toEqual(
      Object.fromEntries(denied.map((key) => [key, 403])),
    );
  });

  it("rejects a revoked device token with 401 before any route runs", async () => {
    const cookie = await loginAs(runtime, "revoked-owner@example.com");
    const token = await pairVehicle(runtime, cookie);
    const [device] = await listDevicesOf(runtime, cookie);
    await deleteAs(runtime, `/v1/devices/${device?.id}`, cookie);
    const response = await runtime.app.request("/healthz", { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
  });
});
