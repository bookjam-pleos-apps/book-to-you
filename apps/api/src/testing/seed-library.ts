import { meResponseSchema } from "@voice-storybook/shared/contracts/v1";
import { eq } from "drizzle-orm";

import { consentRecords, renderChapters, renders, voiceProfiles, voicePrompts } from "../adapters/db/schema";
import type { TestRuntime } from "./test-runtime";

const CONSENT = { termsVersion: "1", aiNoticeVersion: "1" };
export const AUDIO_BYTES = new TextEncoder().encode("0123456789");
const SHA = "a".repeat(64);

export const userIdOf = async (runtime: TestRuntime, cookie: string): Promise<string> => {
  const response = await runtime.app.request("/v1/me", { headers: { cookie } });
  return meResponseSchema.parse(await response.json()).id;
};

export const seedVoiceWithConsent = async (runtime: TestRuntime, userId: string, status: "active" | "checking" = "active") => {
  const [voice] = await runtime.database.insert(voiceProfiles).values({ userId, label: "엄마" }).returning();
  if (!voice) throw new Error("voice not inserted");
  const [consent] = await runtime.database
    .insert(consentRecords)
    .values({ kind: "speaker_voice", userId, voiceProfileId: voice.id, ...CONSENT, status, givenAt: new Date() })
    .returning();
  if (!consent) throw new Error("consent not inserted");
  const activeConsentId = status === "active" ? consent.id : null;
  await runtime.database.update(voiceProfiles).set({ activeConsentId }).where(eq(voiceProfiles.id, voice.id));
  return { voiceId: voice.id, consentId: consent.id };
};

type RenderSeed = {
  readonly userId: string;
  readonly voiceId: string;
  readonly status?: "queued" | "running" | "succeeded" | "failed";
  readonly storyId?: string;
  readonly finishedAt?: Date | null;
  readonly startedAt?: Date | null;
};

export const seedRender = async (runtime: TestRuntime, seed: RenderSeed) => {
  const { userId, voiceId, status = "succeeded", storyId = "toto-picnic", finishedAt = null, startedAt = null } = seed;
  const [render] = await runtime.database
    .insert(renders)
    .values({
      userId,
      voiceProfileId: voiceId,
      storyId,
      storyVersion: "v1",
      renderKey: crypto.randomUUID(),
      refClipIds: [],
      engineId: "fake",
      engineVersion: "1",
      status,
      chaptersTotal: 2,
      finishedAt,
      startedAt,
    })
    .returning();
  if (!render) throw new Error("render not inserted");
  const keys = [0, 1].map((index) => `u/${userId}/v/${voiceId}/r/${render.id}/${index}.m4a`);
  await Promise.all(keys.map((key) => runtime.storage.put(key, AUDIO_BYTES, "audio/mp4")));
  const chapters = await runtime.database
    .insert(renderChapters)
    .values(
      keys.map((storageKey, index) => ({
        renderId: render.id,
        index: 1 - index,
        role: "body" as const,
        storageKey,
        durationMs: 1000,
        bytes: AUDIO_BYTES.length,
        sha256: SHA,
      })),
    )
    .returning();
  return { renderId: render.id, chapterIds: chapters.map((chapter) => chapter.id) };
};

export const seedPrompt = async (runtime: TestRuntime, userId: string, voiceId: string, consentId: string) => {
  const storageKey = `u/${userId}/v/${voiceId}/prompts/belt.wav`;
  await runtime.storage.put(storageKey, AUDIO_BYTES, "audio/wav");
  const [prompt] = await runtime.database
    .insert(voicePrompts)
    .values({
      voiceProfileId: voiceId,
      consentId,
      kind: "belt_unfastened",
      scriptId: "belt",
      scriptVersion: "1",
      storageKey,
      sha256: SHA,
      durationMs: 3000,
      bytes: AUDIO_BYTES.length,
    })
    .returning();
  if (!prompt) throw new Error("prompt not inserted");
  return prompt.id;
};
