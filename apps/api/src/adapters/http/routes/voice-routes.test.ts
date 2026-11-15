import { voiceListResponseSchema, voiceSchema } from "@voice-storybook/shared/contracts/v1";
import { beforeEach, describe, expect, it } from "vitest";

import { seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import { createTestRuntime, loginAs, TEST_ORIGIN, type TestRuntime } from "../../../testing/test-runtime";
import { createVoiceFor } from "../../../testing/voices";

const patchVoice = (runtime: TestRuntime, voiceId: string, cookie: string, body: unknown) =>
  runtime.app.request(`/v1/voices/${voiceId}`, {
    method: "PATCH",
    headers: { cookie, origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const defaultsOf = async (runtime: TestRuntime, cookie: string) => {
  const response = await runtime.app.request("/v1/voices", { headers: { cookie } });
  const { voices } = voiceListResponseSchema.parse(await response.json());
  return Object.fromEntries(voices.map((voice) => [voice.id, voice.isDefault]));
};

describe("PATCH /v1/voices/:id", () => {
  let runtime: TestRuntime;
  let cookie: string;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    cookie = await loginAs(runtime, "parent@example.com");
  });

  it("renames a voice that is still recording", async () => {
    const voiceId = await createVoiceFor(runtime, cookie, "엄마");
    const response = await patchVoice(runtime, voiceId, cookie, { label: " 아빠 " });
    expect(response.status).toBe(200);
    expect(voiceSchema.parse(await response.json())).toMatchObject({ id: voiceId, label: "아빠", isDefault: false });
  });

  it("keeps a single default per account", async () => {
    const userId = await userIdOf(runtime, cookie);
    const first = await seedVoiceWithConsent(runtime, userId);
    const second = await seedVoiceWithConsent(runtime, userId);
    expect((await patchVoice(runtime, first.voiceId, cookie, { isDefault: true })).status).toBe(200);
    expect((await patchVoice(runtime, second.voiceId, cookie, { isDefault: true })).status).toBe(200);
    expect(await defaultsOf(runtime, cookie)).toEqual({ [first.voiceId]: false, [second.voiceId]: true });
    await patchVoice(runtime, second.voiceId, cookie, { isDefault: false });
    expect(await defaultsOf(runtime, cookie)).toEqual({ [first.voiceId]: false, [second.voiceId]: false });
  });

  it("refuses a default without active consent and changes nothing", async () => {
    const voiceId = await createVoiceFor(runtime, cookie, "엄마");
    const response = await patchVoice(runtime, voiceId, cookie, { label: "아빠", isDefault: true });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "no_active_consent" });
    const voice = await runtime.app.request(`/v1/voices/${voiceId}`, { headers: { cookie } });
    expect(voiceSchema.parse(await voice.json())).toMatchObject({ label: "엄마", isDefault: false });
  });

  it("hides another account's voice", async () => {
    const voiceId = await createVoiceFor(runtime, cookie);
    const stranger = await loginAs(runtime, "stranger@example.com");
    expect((await patchVoice(runtime, voiceId, stranger, { label: "남" })).status).toBe(404);
    expect((await patchVoice(runtime, "not-a-uuid", cookie, { label: "남" })).status).toBe(404);
  });

  it.each([{}, { label: "" }, { label: "가".repeat(33) }, { isDefault: "yes" }])("rejects the body %j", async (body) => {
    const voiceId = await createVoiceFor(runtime, cookie);
    expect((await patchVoice(runtime, voiceId, cookie, body)).status).toBe(400);
  });
});
