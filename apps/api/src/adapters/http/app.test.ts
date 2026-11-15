import { describe, expect, it } from "vitest";

import { createApp } from "./app";
import { clearSessionCookie, writeSessionCookie } from "./session-cookie";

const ORIGIN = "https://storybook.example";

const buildApp = () =>
  createApp({
    publicOrigin: ORIGIN,
    authenticator: {
      session: async (token) => (token === "live-session" ? "user-1" : null),
      device: async (token) => (token === "live-device" ? { userId: "user-1", deviceId: "device-1" } : null),
    },
  });

describe("http app", () => {
  it("answers health checks without credentials", async () => {
    const response = await buildApp().request("/healthz");
    expect(response.status).toBe(200);
  });

  it("rejects a cross-site form post", async () => {
    const app = buildApp();
    app.post("/form-target", (c) => c.body(null, 204));
    const response = await app.request("/form-target", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
      body: "a=1",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "request_rejected" });
  });

  it("does not let a cookie stand in for a revoked device token", async () => {
    const response = await buildApp().request("/healthz", {
      headers: { authorization: "Bearer revoked", cookie: "__Host-sid=live-session" },
    });
    expect(response.status).toBe(401);
  });

  it("treats a malformed authorization header as an invalid token", async () => {
    const response = await buildApp().request("/healthz", { headers: { authorization: "Basic abc" } });
    expect(response.status).toBe(401);
  });

  it("treats an expired session cookie as anonymous so login stays reachable", async () => {
    const response = await buildApp().request("/healthz", { headers: { cookie: "__Host-sid=expired" } });
    expect(response.status).toBe(200);
  });

  it("hides internal errors", async () => {
    const app = buildApp();
    app.get("/boom", () => {
      throw new Error("secret detail");
    });
    const response = await app.request("/boom", { headers: { cookie: "__Host-sid=live-session" } });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
  });

  it("sets the session cookie with the attributes the design requires", async () => {
    const app = buildApp();
    app.post("/login", (c) => {
      writeSessionCookie(c, "token", 60);
      return c.body(null, 204);
    });
    const response = await app.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "__Host-sid=live-session" },
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-sid=token");
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/);
  });

  it("expires the session cookie on clear", async () => {
    const app = buildApp();
    app.post("/logout", (c) => {
      clearSessionCookie(c);
      return c.body(null, 204);
    });
    const response = await app.request("/logout", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "__Host-sid=live-session" },
    });
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});
