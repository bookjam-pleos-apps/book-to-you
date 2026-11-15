import { describe, expect, it } from "vitest";

import { sha256Hex } from "../sha256";
import { findSnapshotFlaw, matchesStoredAudio, missingProvenance, type ConsentSnapshot, type DemoSnapshot } from "./demo-snapshot";

const CONSENT: ConsentSnapshot = {
  id: "00000000-0000-4000-8000-000000000001",
  speakerLabel: null,
  termsVersion: "1",
  aiNoticeVersion: "1",
  phrase: "노란 사과 세 개",
  phraseAudioSha256: "a".repeat(64),
  matchScore: 1,
  givenAt: new Date("2026-11-06T00:00:00Z"),
};

const USER_ID = "00000000-0000-4000-8000-0000000000d1";
const VOICE_ID = "00000000-0000-4000-8000-0000000000a1";
const RENDER_ID = "00000000-0000-4000-8000-0000000000b1";
const CHAPTER = { id: "c1", renderId: RENDER_ID, index: 0, role: "body" as const, title: null, storageKey: `u/${USER_ID}/v/${VOICE_ID}/renders/${RENDER_ID}/0.m4a`, durationMs: 1, bytes: 1, sha256: "a".repeat(64) };
const RENDER = { id: RENDER_ID, storyId: "s", storyVersion: "v1", renderKey: "k", refClipIds: [], engineId: "e", engineVersion: "1", chaptersDone: 1, chaptersTotal: 1, startedAt: null, finishedAt: null };
const SNAPSHOT: DemoSnapshot = { userId: USER_ID, voice: { id: VOICE_ID, label: "엄마" }, consent: CONSENT, renders: [RENDER], chapters: [CHAPTER], prompts: [] };

describe("demo snapshot", () => {
  it("names every missing piece of the reading consent", () => {
    expect(missingProvenance(CONSENT)).toEqual([]);
    expect(missingProvenance({ ...CONSENT, phraseAudioSha256: null, matchScore: null })).toEqual(["phraseAudioSha256", "matchScore"]);
  });

  it("treats a zero match score as recorded, not missing", () => {
    expect(missingProvenance({ ...CONSENT, matchScore: 0 })).toEqual([]);
  });

  it("matches audio only when both length and hash agree", () => {
    const bytes = new TextEncoder().encode("chapter");
    const audio = { id: "c", storageKey: "k", durationMs: 1, bytes: bytes.length, sha256: sha256Hex(bytes) };
    expect(matchesStoredAudio(audio, bytes)).toBe(true);
    expect(matchesStoredAudio({ ...audio, bytes: bytes.length + 1 }, bytes)).toBe(false);
    expect(matchesStoredAudio(audio, new TextEncoder().encode("chapteR"))).toBe(false);
  });

  it("flags audio stored outside the voice and chapters without their render", () => {
    expect(findSnapshotFlaw(SNAPSHOT)).toBeNull();
    const outside = { ...SNAPSHOT, chapters: [{ ...CHAPTER, storageKey: `u/${USER_ID}/v/other/0.m4a` }] };
    expect(findSnapshotFlaw(outside)).toEqual({ kind: "audio_outside_voice", key: `u/${USER_ID}/v/other/0.m4a` });
    expect(findSnapshotFlaw({ ...SNAPSHOT, renders: [] })).toEqual({ kind: "chapter_without_render", chapterId: "c1" });
  });
});
