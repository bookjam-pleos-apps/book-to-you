import type { ChapterRole, PromptKind } from "@voice-storybook/shared/vocab";

import { sha256Hex } from "../sha256";
import { voicePrefix } from "../storage-keys";

export const DEMO_SNAPSHOT_VERSION = 1;

// 시연 서버로 옮기는 음성 하나의 기록. 원본 녹음 클립과 GPU 키는 넣지 않는다.
export type ConsentSnapshot = {
  readonly id: string;
  readonly speakerLabel: string | null;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
  readonly phrase: string | null;
  readonly phraseAudioSha256: string | null;
  readonly matchScore: number | null;
  readonly givenAt: Date;
};

export type RenderSnapshot = {
  readonly id: string;
  readonly storyId: string;
  readonly storyVersion: string;
  readonly renderKey: string;
  readonly refClipIds: readonly string[];
  readonly engineId: string;
  readonly engineVersion: string;
  readonly chaptersDone: number;
  readonly chaptersTotal: number;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
};

export type StoredAudio = {
  readonly id: string;
  readonly storageKey: string;
  readonly durationMs: number;
  readonly bytes: number;
  readonly sha256: string;
};

export type ChapterSnapshot = StoredAudio & {
  readonly renderId: string;
  readonly index: number;
  readonly role: ChapterRole;
  readonly title: string | null;
};

export type PromptSnapshot = StoredAudio & {
  readonly kind: PromptKind;
  readonly scriptId: string;
  readonly scriptVersion: string;
};

export type DemoSnapshot = {
  readonly userId: string;
  readonly voice: { readonly id: string; readonly label: string };
  readonly consent: ConsentSnapshot;
  readonly renders: readonly RenderSnapshot[];
  readonly chapters: readonly ChapterSnapshot[];
  readonly prompts: readonly PromptSnapshot[];
};

export type SnapshotObject = {
  readonly key: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

const PROVENANCE_FIELDS = ["phrase", "phraseAudioSha256", "matchScore"] as const;

// 낭독 동의의 근거가 없는 음성은 시연 서버에 올리지 않는다.
export const missingProvenance = (consent: ConsentSnapshot): readonly string[] =>
  PROVENANCE_FIELDS.filter((field) => consent[field] === null);

export const storedAudioOf = (snapshot: DemoSnapshot): readonly StoredAudio[] => [...snapshot.chapters, ...snapshot.prompts];

export const matchesStoredAudio = (audio: StoredAudio, bytes: Uint8Array): boolean =>
  bytes.length === audio.bytes && sha256Hex(bytes) === audio.sha256;

export type SnapshotFlaw =
  | { readonly kind: "audio_outside_voice"; readonly key: string }
  | { readonly kind: "chapter_without_render"; readonly chapterId: string };

// 객체를 올리기 전에 거른다. 키가 음성 경로 밖이면 다른 객체를 덮어쓰고, 렌더 없는 챕터는 행 교체에서 실패한다.
export const findSnapshotFlaw = (snapshot: DemoSnapshot): SnapshotFlaw | null => {
  const prefix = voicePrefix(snapshot.userId, snapshot.voice.id);
  const outside = storedAudioOf(snapshot).find((audio) => !audio.storageKey.startsWith(prefix));
  if (outside !== undefined) return { kind: "audio_outside_voice", key: outside.storageKey };
  const renderIds = new Set(snapshot.renders.map((render) => render.id));
  const orphan = snapshot.chapters.find((chapter) => !renderIds.has(chapter.renderId));
  return orphan === undefined ? null : { kind: "chapter_without_render", chapterId: orphan.id };
};
