import type { ChapterRole, PromptKind } from "@voice-storybook/shared/vocab";

export type AudioAsset = {
  readonly id: string;
  readonly durationMs: number;
  readonly bytes: number;
  readonly sha256: string;
};

export type PlayableChapter = AudioAsset & {
  readonly index: number;
  readonly role: ChapterRole;
  readonly title: string | null;
};

export type PlayableRender = {
  readonly renderId: string;
  readonly storyId: string;
  readonly voiceId: string;
  readonly voiceLabel: string;
  readonly chapters: readonly PlayableChapter[];
};

export type ShelfRender = Omit<PlayableRender, "chapters">;

export type PlayablePrompt = AudioAsset & {
  readonly kind: PromptKind;
  readonly voiceId: string;
};

export type PlayableAudio = {
  readonly storageKey: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly contentType: string;
};

export interface LibraryRepo {
  listPlayableRenders(userId: string): Promise<readonly PlayableRender[]>;
  // 책장에 보이는 렌더(다시 렌더했으면 가장 최근 것)만 찾는다. 장은 읽지 않는다.
  findShelfRender(renderId: string, userId: string): Promise<ShelfRender | null>;
  // 소유와 재생 가능 여부는 부르는 쪽이 이미 확인한 렌더의 장만 돌려준다. 장 번호 순서다.
  listRenderChapters(renderId: string): Promise<readonly PlayableChapter[]>;
  listPlayablePrompts(userId: string): Promise<readonly PlayablePrompt[]>;
  findDefaultVoiceId(userId: string): Promise<string | null>;
  findPlayableAudio(audioId: string, userId: string): Promise<PlayableAudio | null>;
  // 렌더 장만 찾는다. 안내 녹음은 보지 않는다.
  findPlayableChapter(audioId: string, userId: string): Promise<PlayableAudio | null>;
}
