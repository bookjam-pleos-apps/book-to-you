import { renderDetailSchema, renderListResponseSchema } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { seedRender, seedVoiceWithConsent, userIdOf } from "../../../testing/seed-library";
import { createTestRuntime, deleteAs, loginAs, postJson, TEST_DEMO_ENV, TEST_ORIGIN, type TestRuntime } from "../../../testing/test-runtime";
import { users } from "../../db/schema";

const { DEMO_USER_ID } = TEST_DEMO_ENV;

// 데모 계정: 게시된 동화 하나, 실패한 동화 하나, 만드는 중인 동화 하나.
const seedDemo = async (runtime: TestRuntime) => {
  await runtime.database.insert(users).values({ id: DEMO_USER_ID, email: "demo@storybook.example" });
  const { voiceId } = await seedVoiceWithConsent(runtime, DEMO_USER_ID);
  const { renderId, chapterIds } = await seedRender(runtime, { userId: DEMO_USER_ID, voiceId, storyId: "masteraway" });
  await seedRender(runtime, { userId: DEMO_USER_ID, voiceId, storyId: "redhood", status: "failed" });
  await seedRender(runtime, { userId: DEMO_USER_ID, voiceId, storyId: "fisherman", status: "running" });
  return { voiceId, renderId, chapterId: chapterIds[0] ?? "" };
};

const parentOf = async (runtime: TestRuntime) => {
  const cookie = await loginAs(runtime, "parent@example.com");
  const userId = await userIdOf(runtime, cookie);
  const { voiceId } = await seedVoiceWithConsent(runtime, userId);
  const { renderId } = await seedRender(runtime, { userId, voiceId });
  return { cookie, voiceId, renderId };
};

const get = (runtime: TestRuntime, path: string, cookie: string) => runtime.app.request(path, { headers: { cookie } });

const rendersOf = async (runtime: TestRuntime, cookie: string) =>
  renderListResponseSchema.parse(await (await get(runtime, "/v1/renders", cookie)).json()).renders;

const enabledRuntime = () => createTestRuntime({}, { ...TEST_DEMO_ENV, DEMO_SHARED_SHELF: "enabled" });

describe("shared demo shelf on the parent web", () => {
  it("lists the demo account's published stories after the parent's own, marked shared", async () => {
    const runtime = await enabledRuntime();
    const demo = await seedDemo(runtime);
    const parent = await parentOf(runtime);
    expect((await rendersOf(runtime, parent.cookie)).map(({ renderId, shared, status }) => [renderId, shared, status])).toEqual([
      [parent.renderId, false, "playable"],
      [demo.renderId, true, "playable"],
    ]);
  });

  it("opens a shared story and its audio for listening", async () => {
    const runtime = await enabledRuntime();
    const demo = await seedDemo(runtime);
    const parent = await parentOf(runtime);
    const detail = renderDetailSchema.parse(await (await get(runtime, `/v1/renders/${demo.renderId}`, parent.cookie)).json());
    expect(detail).toMatchObject({ renderId: demo.renderId, shared: true, status: "playable" });
    expect(detail.chapters).toHaveLength(2);
    expect((await get(runtime, `/v1/audio/${demo.chapterId}`, parent.cookie)).status).toBe(200);
  });

  it("keeps every write on the demo voice closed to other accounts", async () => {
    const runtime = await enabledRuntime();
    const demo = await seedDemo(runtime);
    const { cookie } = await parentOf(runtime);
    const patch = await runtime.app.request(`/v1/voices/${demo.voiceId}`, {
      method: "PATCH",
      headers: { cookie, origin: TEST_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ label: "내 것", isDefault: true }),
    });
    expect(patch.status).toBe(404);
    expect((await deleteAs(runtime, `/v1/voices/${demo.voiceId}`, cookie)).status).toBe(404);
    expect((await get(runtime, `/v1/voices/${demo.voiceId}`, cookie)).status).toBe(404);
    expect((await postJson(runtime, `/v1/voices/${demo.voiceId}/consent/phrase`, {}, { cookie })).status).toBe(404);
    expect((await postJson(runtime, "/v1/renders", { storyId: "redhood", voiceId: demo.voiceId }, { cookie })).status).toBe(404);
  });

  it("shows only the parent's own stories when the flag is off", async () => {
    const runtime = await createTestRuntime({}, TEST_DEMO_ENV);
    const demo = await seedDemo(runtime);
    const parent = await parentOf(runtime);
    expect((await rendersOf(runtime, parent.cookie)).map((render) => render.renderId)).toEqual([parent.renderId]);
    expect((await get(runtime, `/v1/renders/${demo.renderId}`, parent.cookie)).status).toBe(404);
  });
});
