import { manifestSchema } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { seedPrompt, seedRender, seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import { createTestRuntime, loginAs, pairVehicle, TEST_DEMO_ENV, type TestRuntime } from "../../../testing/test-runtime";
import { users } from "../../db/schema";

const { DEMO_USER_ID } = TEST_DEMO_ENV;

const seedDemoShelf = async (runtime: TestRuntime) => {
  await runtime.database.insert(users).values({ id: DEMO_USER_ID, email: "demo@storybook.example" });
  const { voiceId, consentId } = await seedVoiceWithConsent(runtime, DEMO_USER_ID);
  const { renderId, chapterIds } = await seedRender(runtime, { userId: DEMO_USER_ID, voiceId, storyId: "masteraway" });
  const promptId = await seedPrompt(runtime, DEMO_USER_ID, voiceId, consentId);
  return { renderId, chapterId: chapterIds[0] ?? "", promptId };
};

const parentCarOf = async (runtime: TestRuntime, email: string) => {
  const cookie = await loginAs(runtime, email);
  const userId = await userIdOf(runtime, cookie);
  return { userId, headers: { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` } };
};

const manifestOf = async (runtime: TestRuntime, headers: Record<string, string>) =>
  manifestSchema.parse(await (await runtime.app.request("/v1/library/manifest", { headers })).json());

const audioStatus = async (runtime: TestRuntime, id: string, headers: Record<string, string>) =>
  (await runtime.app.request(`/v1/audio/${id}`, { headers })).status;

describe("shared demo shelf on the demo server", () => {
  it("adds the demo stories to another account's car and opens only their chapters", async () => {
    const runtime = await createTestRuntime({}, { ...TEST_DEMO_ENV, DEMO_SHARED_SHELF: "enabled" });
    const demo = await seedDemoShelf(runtime);
    const parent = await parentCarOf(runtime, "parent@example.com");
    const { voiceId } = await seedVoiceWithConsent(runtime, parent.userId);
    const { renderId: ownRender } = await seedRender(runtime, { userId: parent.userId, voiceId });
    const stranger = await parentCarOf(runtime, "stranger@example.com");
    const { voiceId: strangerVoice } = await seedVoiceWithConsent(runtime, stranger.userId);
    const { chapterIds: strangerChapters } = await seedRender(runtime, { userId: stranger.userId, voiceId: strangerVoice });

    const manifest = await manifestOf(runtime, parent.headers);
    expect(manifest.stories.map((story) => story.renderId).toSorted()).toEqual([ownRender, demo.renderId].toSorted());
    expect(manifest.prompts).toEqual([]);
    expect(manifest.defaultVoiceId).toBeNull();
    expect(await audioStatus(runtime, demo.chapterId, parent.headers)).toBe(200);
    expect(await audioStatus(runtime, demo.promptId, parent.headers)).toBe(404);
    expect(await audioStatus(runtime, strangerChapters[0] ?? "", parent.headers)).toBe(404);
  });

  it("keeps every account to its own shelf when the flag is off", async () => {
    const runtime = await createTestRuntime({}, TEST_DEMO_ENV);
    const demo = await seedDemoShelf(runtime);
    const parent = await parentCarOf(runtime, "parent@example.com");
    expect((await manifestOf(runtime, parent.headers)).stories).toEqual([]);
    expect(await audioStatus(runtime, demo.chapterId, parent.headers)).toBe(404);
  });
});
