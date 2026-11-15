import { beforeEach, describe, expect, it } from "vitest";

import { seedRender, seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import { createTestRuntime, loginAs, pairVehicle, postJson, type TestRuntime } from "../../../testing/test-runtime";
import { storyReports } from "../../db/schema";

describe("story reports", () => {
  let runtime: TestRuntime;
  let userId: string;
  let renderId: string;
  let bearer: { authorization: string };

  beforeEach(async () => {
    runtime = await createTestRuntime();
    const cookie = await loginAs(runtime, "parent@example.com");
    userId = await userIdOf(runtime, cookie);
    bearer = { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` };
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    ({ renderId } = await seedRender(runtime, { userId, voiceId }));
  });

  const report = (body: unknown, headers: Record<string, string> = bearer) => postJson(runtime, "/v1/reports", body, headers);

  it("records a vehicle's report with the story it heard", async () => {
    const response = await report({ renderId, reason: "voice" });
    expect(response.status).toBe(204);
    const rows = await runtime.database.select().from(storyReports);
    expect(rows).toMatchObject([{ userId, renderId, storyId: "toto-picnic", reason: "voice" }]);
    expect(rows[0]?.deviceId).not.toBeNull();
  });

  it("counts the same report from the same vehicle once", async () => {
    await report({ renderId, reason: "content" });
    await report({ renderId, reason: "content" });
    expect(await runtime.database.select().from(storyReports)).toHaveLength(1);
  });

  it("accepts only the latest render of a story that was rendered again", async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    const older = await seedRender(runtime, { userId, voiceId, storyId: "redhood", finishedAt: new Date("2026-11-01T00:00:00Z") });
    const latest = await seedRender(runtime, { userId, voiceId, storyId: "redhood", finishedAt: new Date("2026-11-02T00:00:00Z") });
    expect((await report({ renderId: older.renderId, reason: "voice" })).status).toBe(404);
    expect((await report({ renderId: latest.renderId, reason: "voice" })).status).toBe(204);
  });

  it("rejects a story that is not on the shelf, an unknown reason, and a call without a token", async () => {
    expect((await report({ renderId: crypto.randomUUID(), reason: "voice" })).status).toBe(404);
    expect((await report({ renderId, reason: "other" })).status).toBe(400);
    expect((await report({ renderId, reason: "voice" }, {})).status).toBe(401);
    expect(await runtime.database.select().from(storyReports)).toEqual([]);
  });
});
