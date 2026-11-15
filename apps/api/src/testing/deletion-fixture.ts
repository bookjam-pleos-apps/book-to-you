import { randomUUID } from "node:crypto";

import { consentRecords, voiceClips, voiceHandles } from "../adapters/db/schema";
import { clipKey } from "../domain/storage-keys";
import { seedRender, seedVoiceWithConsent, userIdOf } from "./seed-library";
import { loginAs, pairVehicle, type TestRuntime } from "./test-runtime";

const AUDIO = new TextEncoder().encode("voice");

export const seedClipWithHandle = async (runtime: TestRuntime, userId: string, voiceId: string, consentId: string, handleKey: string) => {
  const id = randomUUID();
  const storageKey = clipKey(userId, voiceId, id);
  await runtime.storage.put(storageKey, AUDIO, "audio/wav");
  await runtime.database.insert(voiceClips).values({
    id,
    voiceProfileId: voiceId,
    consentId,
    style: "calm",
    scriptId: "calm",
    scriptVersion: "1",
    storageKey,
    sha256: "a",
    durationMs: 1000,
  });
  await runtime.database.insert(voiceHandles).values({ clipId: id, engineId: "fake", modelRev: "1", key: handleKey });
  return { clipId: id, storageKey };
};

export const seedFullAccount = async (runtime: TestRuntime, email: string) => {
  const cookie = await loginAs(runtime, email);
  const userId = await userIdOf(runtime, cookie);
  const token = await pairVehicle(runtime, cookie);
  const { voiceId, consentId } = await seedVoiceWithConsent(runtime, userId);
  const clip = await seedClipWithHandle(runtime, userId, voiceId, consentId, `handle-${randomUUID()}`);
  const render = await seedRender(runtime, { userId, voiceId });
  return { cookie, userId, token, voiceId, consentId, clip, render, bearer: { authorization: `Bearer ${token}` } };
};

export const receiptsOf = (runtime: TestRuntime) => runtime.database.select().from(consentRecords);
