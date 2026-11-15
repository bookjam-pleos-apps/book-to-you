import { describe, expect, it } from "vitest";

import { judgeAccess } from "./access-policy";
import { ANONYMOUS, type Principal } from "./principal";

const DEVICE: Principal = { kind: "device", userId: "u", deviceId: "d" };
const SESSION: Principal = { kind: "session", userId: "u" };

describe("judgeAccess", () => {
  it("denies an unlisted route for anonymous callers and devices", () => {
    expect(judgeAccess(ANONYMOUS, "GET /v1/unlisted")).toBe("unauthenticated");
    expect(judgeAccess(DEVICE, "GET /v1/unlisted")).toBe("forbidden");
  });

  it("does not open public routes to a device token", () => {
    expect(judgeAccess(DEVICE, "GET /healthz")).toBe("forbidden");
  });

  it("allows a session on any route", () => {
    expect(judgeAccess(SESSION, "GET /v1/unlisted")).toBe("allow");
  });
});
