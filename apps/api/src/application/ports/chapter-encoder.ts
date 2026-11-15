export type ChapterMetadata = {
  readonly title: string;
  readonly aiNotice: string;
};

// endMs가 null이면 끝까지다.
export type AudioRange = {
  readonly startMs: number;
  readonly endMs: number | null;
};

export type EncodedChapter = {
  readonly bytes: Uint8Array;
  readonly durationMs: number;
};

export interface ChapterEncoder {
  encode(wav: Uint8Array, metadata: ChapterMetadata, range?: AudioRange): Promise<EncodedChapter>;
}
