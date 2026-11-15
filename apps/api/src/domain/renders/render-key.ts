export type RenderKeyParts = {
  readonly voiceId: string;
  readonly storyId: string;
  readonly storyVersion: string;
  readonly refClipIds: readonly string[];
  readonly engineId: string;
  readonly engineVersion: string;
  readonly assemblyVersion: string;
};

export const renderKey = (parts: RenderKeyParts, hash: (input: string) => string): string =>
  hash(
    JSON.stringify([
      parts.voiceId,
      parts.storyId,
      parts.storyVersion,
      parts.refClipIds.toSorted(),
      parts.engineId,
      parts.engineVersion,
      parts.assemblyVersion,
    ]),
  );
