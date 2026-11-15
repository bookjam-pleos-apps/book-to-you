import { describe, expect, it } from "vitest";

import type { LibraryRepo, PlayableAudio, PlayableRender } from "./ports";
import { withSharedShelf } from "./shared-shelf";

const DEMO = "demo-user";
const PARENT = "parent-user";
const STRANGER = "stranger-user";

const renderOf = (renderId: string, voiceId: string): PlayableRender => ({ renderId, storyId: "redhood", voiceId, voiceLabel: "엄마", chapters: [] });
const audioOf = (storageKey: string): PlayableAudio => ({ storageKey, bytes: 1, sha256: "s", contentType: "audio/mp4" });

const RENDERS: Record<string, readonly PlayableRender[]> = { [DEMO]: [renderOf("demo-render", "demo-voice")], [PARENT]: [renderOf("own-render", "own-voice")] };
const CHAPTERS: Record<string, Record<string, PlayableAudio>> = {
  [DEMO]: { "demo-chapter": audioOf("demo/chapter") },
  [PARENT]: { "own-chapter": audioOf("own/chapter") },
  [STRANGER]: { "stranger-chapter": audioOf("stranger/chapter") },
};
const PROMPTS: Record<string, Record<string, PlayableAudio>> = { [DEMO]: { "demo-prompt": audioOf("demo/prompt") }, [PARENT]: { "own-prompt": audioOf("own/prompt") } };

const fakeLibrary: LibraryRepo = {
  listPlayableRenders: async (userId) => RENDERS[userId] ?? [],
  findShelfRender: async (renderId, userId) => (RENDERS[userId] ?? []).find((render) => render.renderId === renderId) ?? null,
  listRenderChapters: async () => [],
  listPlayablePrompts: async () => [],
  findDefaultVoiceId: async (userId) => (userId === PARENT ? "own-voice" : null),
  findPlayableChapter: async (audioId, userId) => CHAPTERS[userId]?.[audioId] ?? null,
  findPlayableAudio: async (audioId, userId) => CHAPTERS[userId]?.[audioId] ?? PROMPTS[userId]?.[audioId] ?? null,
};

const shelf = withSharedShelf(fakeLibrary, DEMO);
const renderIdsOf = async (userId: string) => (await shelf.listPlayableRenders(userId)).map((render) => render.renderId);

describe("shared demo shelf", () => {
  it("adds the demo account's published renders after the parent's own, and never twice for the demo account", async () => {
    expect(await renderIdsOf(PARENT)).toEqual(["own-render", "demo-render"]);
    expect(await renderIdsOf("new-quick-start-user")).toEqual(["demo-render"]);
    expect(await renderIdsOf(DEMO)).toEqual(["demo-render"]);
  });

  it("opens the demo account's chapter audio but not its prompts or anyone else's audio", async () => {
    expect(await shelf.findPlayableAudio("demo-chapter", PARENT)).toEqual(audioOf("demo/chapter"));
    expect(await shelf.findPlayableAudio("demo-prompt", PARENT)).toBeNull();
    expect(await shelf.findPlayableAudio("stranger-chapter", PARENT)).toBeNull();
    expect(await shelf.findPlayableAudio("own-prompt", PARENT)).toEqual(audioOf("own/prompt"));
    expect(await shelf.findPlayableAudio("own-chapter", STRANGER)).toBeNull();
  });

  it("finds the demo account's render on anyone's shelf but not another parent's render", async () => {
    expect((await shelf.findShelfRender("demo-render", PARENT))?.voiceId).toBe("demo-voice");
    expect((await shelf.findShelfRender("own-render", PARENT))?.voiceId).toBe("own-voice");
    expect(await shelf.findShelfRender("own-render", STRANGER)).toBeNull();
  });

  it("keeps the parent's own default voice", async () => {
    expect(await shelf.findDefaultVoiceId(PARENT)).toBe("own-voice");
    expect(await shelf.findDefaultVoiceId("new-quick-start-user")).toBeNull();
  });
});
