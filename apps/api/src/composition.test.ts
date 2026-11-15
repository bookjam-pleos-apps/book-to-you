import { describe, expect, it } from "vitest";

import { selectMailer, selectPurgeEngine } from "./composition";
import { loadEnv } from "./config";

const BASE = {
  DATABASE_URL: "postgres://unused",
  PUBLIC_ORIGIN: "https://storybook.example",
  AUTH_SECRET: "test-secret-test-secret-test-secret",
  S3_ENDPOINT: "http://unused.example",
  S3_BUCKET: "unused",
  MINIO_ROOT_USER: "unused",
  MINIO_ROOT_PASSWORD: "unused",
};

describe("environment", () => {
  it("refuses to guess the environment, so a forgotten value cannot log OTP codes", () => {
    expect(() => loadEnv(BASE)).toThrow(/NODE_ENV/);
  });

  it("refuses the logging mailer in production", () => {
    expect(() => selectMailer(loadEnv({ ...BASE, NODE_ENV: "production" }))).toThrow();
    expect(() => selectMailer(loadEnv({ ...BASE, NODE_ENV: "development" }))).not.toThrow();
  });

  it("refuses a half configured demo pairing instead of silently leaving it off", () => {
    const env = { ...BASE, NODE_ENV: "production", DEMO_PAIRING_CODE: "demo-7Kq2-Xv9p-Lm4r" };
    expect(() => loadEnv(env)).toThrow(/DEMO_PAIRING_CODE/);
    const complete = { ...env, DEMO_USER_ID: "00000000-0000-4000-8000-0000000000d1", DEMO_PAIRING_UNTIL: "2026-12-05T00:00:00+09:00" };
    expect(loadEnv(complete).DEMO_PAIRING_CODE).toBe("demo-7Kq2-Xv9p-Lm4r");
    expect(() => loadEnv({ ...complete, DEMO_PAIRING_CODE: "short" })).toThrow(/DEMO_PAIRING_CODE/);
  });

  it("keeps the shared demo shelf off unless asked, and refuses it without a demo account", () => {
    const env = { ...BASE, NODE_ENV: "production" };
    expect(loadEnv(env).DEMO_SHARED_SHELF).toBe("disabled");
    expect(loadEnv({ ...env, DEMO_SHARED_SHELF: "" }).DEMO_SHARED_SHELF).toBe("disabled");
    expect(() => loadEnv({ ...env, DEMO_SHARED_SHELF: "enabled" })).toThrow(/DEMO_SHARED_SHELF/);
    const demo = { DEMO_PAIRING_CODE: "demo-7Kq2-Xv9p-Lm4r", DEMO_USER_ID: "00000000-0000-4000-8000-0000000000d1", DEMO_PAIRING_UNTIL: "2026-12-05T00:00:00+09:00" };
    expect(loadEnv({ ...env, ...demo, DEMO_SHARED_SHELF: "enabled" }).DEMO_SHARED_SHELF).toBe("enabled");
  });

  it("starts production without a mailer only when login is switched off", () => {
    expect(selectMailer(loadEnv({ ...BASE, NODE_ENV: "production", LOGIN_MODE: "disabled" }))).toBeNull();
    expect(() => selectMailer(loadEnv({ ...BASE, NODE_ENV: "production", LOGIN_MODE: "otp" }))).toThrow();
    expect(() => loadEnv({ ...BASE, NODE_ENV: "production", LOGIN_MODE: "off" })).toThrow(/LOGIN_MODE/);
  });

  it("treats an empty COMPOSE_URL as not configured and refuses a broken one", () => {
    const env = { ...BASE, NODE_ENV: "development" };
    expect(loadEnv({ ...env, COMPOSE_URL: "" }).COMPOSE_URL).toBeUndefined();
    expect(loadEnv(env).COMPOSE_URL).toBeUndefined();
    expect(() => loadEnv({ ...env, COMPOSE_URL: "not a url" })).toThrow(/COMPOSE_URL/);
  });

  it("never pretends to purge GPU keys in production", async () => {
    const production = selectPurgeEngine(loadEnv({ ...BASE, NODE_ENV: "production" }));
    await expect(production.purge(["key"])).rejects.toThrow("GPU");
    const development = selectPurgeEngine(loadEnv({ ...BASE, NODE_ENV: "development" }));
    await expect(development.purge(["key"])).resolves.toBeUndefined();
  });
});
