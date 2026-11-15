import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { ipRateLimit } from "./ip-rate-limit";
import type { AppEnv } from "./principal";

const buildApp = (maxTrackedAddresses: number) => {
  const app = new Hono<AppEnv>();
  app.use(
    ipRateLimit({
      limit: 1,
      windowMs: 60_000,
      clock: () => new Date(0),
      trustProxy: true,
      remoteAddress: () => "10.0.0.1",
      maxTrackedAddresses,
    }),
  );
  app.get("/", (c) => c.body(null, 204));
  return app;
};

const hit = async (app: Hono<AppEnv>, address: string): Promise<number> =>
  (await app.request("/", { headers: { "x-forwarded-for": address } })).status;

describe("ip rate limit", () => {
  it("limits one address and leaves others alone", async () => {
    const app = buildApp(10);
    expect(await hit(app, "1.1.1.1")).toBe(204);
    expect(await hit(app, "1.1.1.1")).toBe(429);
    expect(await hit(app, "2.2.2.2")).toBe(204);
  });

  it("forgets the oldest address when full, so memory stays bounded", async () => {
    const app = buildApp(2);
    await hit(app, "1.1.1.1");
    await hit(app, "2.2.2.2");
    expect(await hit(app, "2.2.2.2")).toBe(429);
    await hit(app, "3.3.3.3");
    expect(await hit(app, "1.1.1.1")).toBe(204);
  });
});
