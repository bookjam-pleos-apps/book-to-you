import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { consentRecords, renderChapters, renders, voiceProfiles } from "../adapters/db/schema";
import { chapterKey } from "../domain/storage-keys";
import { sha256Hex } from "../domain/sha256";
import type { TestRuntime } from "./test-runtime";

const PROVENANCE = { phrase: "노란 사과 세 개", phraseAudioSha256: "b".repeat(64), matchScore: 1 };

// 낭독 근거까지 갖춘 활성 음성 동의 행의 값.
export const activeConsentFor = (userId: string, voiceId: string) => ({
  kind: "speaker_voice" as const,
  userId,
  voiceProfileId: voiceId,
  termsVersion: "1",
  aiNoticeVersion: "1",
  status: "active" as const,
  givenAt: new Date(),
  ...PROVENANCE,
});

type PlayableVoice = { readonly label: string; readonly bytes: Uint8Array };

const insertActiveVoice = async (runtime: TestRuntime, userId: string, label: string): Promise<string> => {
  const [voice] = await runtime.database.insert(voiceProfiles).values({ userId, label }).returning();
  if (!voice) throw new Error("voice not inserted");
  const [given] = await runtime.database.insert(consentRecords).values(activeConsentFor(userId, voice.id)).returning();
  if (!given) throw new Error("consent not inserted");
  await runtime.database.update(voiceProfiles).set({ activeConsentId: given.id }).where(eq(voiceProfiles.id, voice.id));
  return voice.id;
};

// masteraway를 렌더해 챕터 하나를 저장한 것처럼 만든다. 내보내기가 대조하므로 해시는 실제 바이트로 계산한다.
export const seedPlayableRender = async (runtime: TestRuntime, userId: string, voiceId: string, bytes: Uint8Array, finishedAt: Date | null = null): Promise<string> => {
  const render = { userId, voiceProfileId: voiceId, storyId: "masteraway", storyVersion: "v1", renderKey: randomUUID(), refClipIds: [], engineId: "qwen3-base", engineVersion: "1", status: "succeeded" as const, chaptersTotal: 1, chaptersDone: 1, finishedAt };
  const [rendered] = await runtime.database.insert(renders).values(render).returning();
  if (!rendered) throw new Error("render not inserted");
  const sha256 = sha256Hex(bytes);
  const storageKey = chapterKey(userId, voiceId, rendered.id, 0, sha256);
  await runtime.storage.put(storageKey, bytes, "audio/mp4");
  await runtime.database.insert(renderChapters).values({ renderId: rendered.id, index: 0, role: "body", storageKey, durationMs: 1000, bytes: bytes.length, sha256 });
  return rendered.id;
};

// 활성 동의(낭독 근거 포함)와 성공한 렌더 한 편, 저장된 챕터 하나를 가진 음성을 만든다.
export const seedPlayableVoice = async (runtime: TestRuntime, userId: string, { label, bytes }: PlayableVoice): Promise<string> => {
  const voiceId = await insertActiveVoice(runtime, userId, label);
  await seedPlayableRender(runtime, userId, voiceId, bytes);
  return voiceId;
};
