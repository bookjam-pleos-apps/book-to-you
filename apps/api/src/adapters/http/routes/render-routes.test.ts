import { renderListResponseSchema, storyListResponseSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { seedRender, seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import { createTestRuntime, loginAs, pairVehicle, type TestRuntime } from "../../../testing/test-runtime";
import { voiceProfiles } from "../../db/schema";

const at = (hour: number) => new Date(`2026-11-12T0${hour}:00:00Z`);

describe("GET /v1/stories and GET /v1/renders", () => {
  let runtime: TestRuntime;
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
    userId = await userIdOf(runtime, cookie);
  });

  const renders = async () => {
    const response = await runtime.app.request("/v1/renders", { headers: { cookie } });
    expect(response.status).toBe(200);
    return renderListResponseSchema.parse(await response.json()).renders;
  };

  it("lists the confirmed stories with their titles", async () => {
    const response = await runtime.app.request("/v1/stories", { headers: { cookie } });
    expect(storyListResponseSchema.parse(await response.json())).toEqual({ stories: [{ id: "toto-picnic", title: "토토의 소풍" }] });
  });

  it("returns an empty list for an account without renders", async () => {
    expect(await renders()).toEqual([]);
  });

  it("shows one line per pair with the status rule applied", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    await seedRender(runtime, { userId, voiceId, startedAt: at(1) });
    const { renderId: making } = await seedRender(runtime, { userId, voiceId, status: "running", startedAt: at(2) });
    const { renderId: playable } = await seedRender(runtime, { userId, voiceId, storyId: "masteraway", startedAt: at(3) });
    await seedRender(runtime, { userId, voiceId, storyId: "fisherman", status: "failed", startedAt: at(4) });
    const listed = await renders();
    expect(listed.map(({ storyId, status }) => [storyId, status])).toEqual([
      ["fisherman", "failed"],
      ["masteraway", "playable"],
      ["toto-picnic", "making"],
    ]);
    expect(listed.find((render) => render.status === "making")).toMatchObject({ renderId: making, title: "토토의 소풍", voiceLabel: "엄마" });
    expect(listed.find((render) => render.status === "playable")?.renderId).toBe(playable);
  });

  it("shows a finished render as failed once the consent is gone", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    await seedRender(runtime, { userId, voiceId, startedAt: at(1) });
    await runtime.database.update(voiceProfiles).set({ activeConsentId: null }).where(eq(voiceProfiles.id, voiceId));
    expect((await renders()).map((render) => render.status)).toEqual(["failed"]);
  });

  it("does not show another account's renders", async () => {
    const other = await userIdOf(runtime, await loginAs(runtime, "other@example.com"));
    const { voiceId } = await seedVoiceWithConsent(runtime, other);
    await seedRender(runtime, { userId: other, voiceId, startedAt: at(1) });
    expect(await renders()).toEqual([]);
  });

  it("rejects anonymous callers and vehicle tokens", async () => {
    const bearer = { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` };
    const statuses = await Promise.all(
      ["/v1/stories", "/v1/renders"].flatMap((path) => [runtime.app.request(path), runtime.app.request(path, { headers: bearer })]),
    );
    expect(statuses.map((response) => response.status)).toEqual([401, 403, 401, 403]);
  });
});
