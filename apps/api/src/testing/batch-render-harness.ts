import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { manifestSchema } from "@voice-storybook/shared/contracts/v1";
import type { Style } from "@voice-storybook/shared/vocab";
import { eq } from "drizzle-orm";

import { loadRecordingScripts } from "../adapters/content/recording-scripts";
import { createRenderRepo } from "../adapters/db/repos/render-repo";
import { consentRecords, renders, voiceClips } from "../adapters/db/schema";
import type { AudioRange } from "../application/ports/chapter-encoder";
import { publishRender, startBatchRender } from "../application/renders";
import type { StoryContent } from "../application/stories";
import type { Silence } from "../domain/renders/chapter-plan";
import type { ReadAs } from "../domain/renders/reference-plan";
import { POLICY } from "../config";
import { clipKey } from "../domain/storage-keys";
import { seedVoiceWithConsent, userIdOf } from "./seed-library";
import { createTestRuntime, loginAs, TEST_STORY } from "./test-runtime";

export const STORY = TEST_STORY;
export const GOOD_REPORT = [{ text: "첫 문장. 신나는 문장!", passed: true }];
export const CHAPTER = new TextEncoder().encode("m4a-bytes");
export const STORY_WAV = new Uint8Array([1]);
// style마다 다른 바이트라 작업에 맞는 녹음이 들어갔는지 구별된다.
export const referenceOf = (style: Style): Uint8Array => new TextEncoder().encode(`reference ${style}`);
export const SCRIPTS = loadRecordingScripts(resolve(import.meta.dirname, "../../../../content/scripts/recording-scripts.json"));

// 기본은 설정(POLICY.batchRender.readAs)처럼 비어 있다. 정책 연결을 시험할 때만 넘긴다.
type HarnessOptions = { readonly readAs?: ReadAs };

type ClipSeed = { readonly status?: "passed" | "checking" | "failed"; readonly style?: Style; readonly scriptId?: string };

export const createBatchHarness = async ({ readAs = {} }: HarnessOptions = {}) => {
  const runtime = await createTestRuntime();
  const cookie = await loginAs(runtime, "parent@example.com");
  const userId = await userIdOf(runtime, cookie);
  const state: { story: StoryContent | null; notices: string[]; silences: readonly Silence[]; ranges: (AudioRange | undefined)[] } = {
    story: STORY,
    notices: [],
    silences: [],
    ranges: [],
  };
  const stories = { findStory: (id: string) => (state.story?.id === id ? state.story : null) };
  const repo = createRenderRepo(runtime.database);
  const silences = { findParagraphSilences: async () => state.silences };
  const encoder = (bytes: Uint8Array) => ({
    encode: async (_: Uint8Array, { aiNotice }: { readonly aiNotice: string }, range?: AudioRange) => {
      state.notices.push(aiNotice);
      state.ranges.push(range);
      return { bytes, durationMs: 1234 };
    },
  });
  const publishDeps = { renders: repo, stories, storage: runtime.storage, clock: runtime.clock, aiNotice: "AI 고지", encoder: encoder(CHAPTER), silences };
  const start = startBatchRender({ renders: repo, stories, storage: runtime.storage, scripts: SCRIPTS, clock: runtime.clock, policy: { ...POLICY.batchRender, readAs } });
  const publish = publishRender(publishDeps);

  // 대본은 기본으로 그 style의 녹음 대본을 쓴다.
  const seedClip = async (voiceId: string, { status = "passed", style = "calm", scriptId = style }: ClipSeed = {}) => {
    const [consent] = await runtime.database.select().from(consentRecords).where(eq(consentRecords.voiceProfileId, voiceId));
    if (consent === undefined) throw new Error("consent missing");
    const id = randomUUID();
    const storageKey = clipKey(userId, voiceId, id);
    await runtime.storage.put(storageKey, referenceOf(style), "audio/wav");
    await runtime.database.insert(voiceClips).values({
      id, voiceProfileId: voiceId, consentId: consent.id, style, scriptId, scriptVersion: "1", storageKey, sha256: "a", durationMs: 15_000, status,
    });
    return id;
  };

  const readyVoice = async () => {
    const { voiceId } = await seedVoiceWithConsent(runtime, userId);
    return { voiceId, clipId: await seedClip(voiceId) };
  };

  const startedJob = async (voiceId: string) => {
    const result = await start({ voiceId, storyId: STORY.id });
    if (result.kind !== "started") throw new Error(`not started: ${result.kind}`);
    return result;
  };

  const renderRow = async (renderId: string) => {
    const [row] = await runtime.database.select().from(renders).where(eq(renders.id, renderId));
    return row;
  };

  const manifest = async () => manifestSchema.parse(await (await runtime.app.request("/v1/library/manifest", { headers: { cookie } })).json());

  return { runtime, cookie, userId, state, repo, start, publish, publishDeps, encoder, seedClip, readyVoice, startedJob, renderRow, manifest };
};
