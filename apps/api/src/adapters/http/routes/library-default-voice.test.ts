import { manifestSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { seedRender, seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import { createTestRuntime, loginAs, pairVehicle, type TestRuntime } from "../../../testing/test-runtime";
import { consentRecords, voiceProfiles } from "../../db/schema";

describe("vehicle library default voice", () => {
  let runtime: TestRuntime;
  let userId: string;
  let bearer: { authorization: string };

  beforeEach(async () => {
    runtime = await createTestRuntime();
    const cookie = await loginAs(runtime, "parent@example.com");
    userId = await userIdOf(runtime, cookie);
    bearer = { authorization: `Bearer ${await pairVehicle(runtime, cookie)}` };
  });

  const manifest = async () => {
    const response = await runtime.app.request("/v1/library/manifest", { headers: bearer });
    return manifestSchema.parse(await response.json());
  };

  const makeDefault = (voiceId: string) =>
    runtime.database.update(voiceProfiles).set({ isDefault: true }).where(eq(voiceProfiles.id, voiceId));

  const seedVoiceWithStories = async () => {
    const voice = await seedVoiceWithConsent(runtime, userId);
    await seedRender(runtime, { userId, voiceId: voice.voiceId, storyId: "toto-picnic" });
    await seedRender(runtime, { userId, voiceId: voice.voiceId, storyId: "masteraway" });
    return voice;
  };

  it("names the default voice and puts its shelf first", async () => {
    const [first, second] = [await seedVoiceWithStories(), await seedVoiceWithStories()].toSorted((left, right) =>
      left.voiceId < right.voiceId ? -1 : 1,
    );
    if (first === undefined || second === undefined) throw new Error("voices not seeded");
    await makeDefault(second.voiceId);
    const { defaultVoiceId, stories } = await manifest();
    expect(defaultVoiceId).toBe(second.voiceId);
    expect(stories.map((story) => [story.voiceId, story.storyId])).toEqual([
      [second.voiceId, "masteraway"],
      [second.voiceId, "toto-picnic"],
      [first.voiceId, "masteraway"],
      [first.voiceId, "toto-picnic"],
    ]);
  });

  it("names a default voice that has no story yet", async () => {
    await seedVoiceWithStories();
    const fresh = await seedVoiceWithConsent(runtime, userId);
    await makeDefault(fresh.voiceId);
    const { defaultVoiceId, stories } = await manifest();
    expect(defaultVoiceId).toBe(fresh.voiceId);
    expect(stories.every((story) => story.voiceId !== fresh.voiceId)).toBe(true);
  });

  it("drops the default once its consent is revoked", async () => {
    const voice = await seedVoiceWithStories();
    await makeDefault(voice.voiceId);
    await runtime.database.update(consentRecords).set({ status: "revoked" }).where(eq(consentRecords.id, voice.consentId));
    expect(await manifest()).toMatchObject({ defaultVoiceId: null, stories: [] });
  });
});
