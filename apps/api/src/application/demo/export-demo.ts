import {
  matchesStoredAudio,
  missingProvenance,
  type DemoSnapshot,
  type SnapshotObject,
  type StoredAudio,
} from "../../domain/demo/demo-snapshot";
import { CHAPTER_CONTENT_TYPE, WAV_CONTENT_TYPE } from "../../domain/audio-content-type";
import { readObjectBytes, type ObjectStorage } from "../ports/object-storage";
import type { DemoSnapshotRepo } from "./ports";

export type DemoTransferDeps = {
  readonly repo: DemoSnapshotRepo;
  readonly storage: ObjectStorage;
};

export type DemoExport =
  | { readonly kind: "exported"; readonly snapshot: DemoSnapshot; readonly objects: readonly SnapshotObject[] }
  | { readonly kind: "no_active_voice" }
  | { readonly kind: "missing_provenance"; readonly fields: readonly string[] }
  | { readonly kind: "corrupt_object"; readonly key: string };

type TypedAudio = { readonly audio: StoredAudio; readonly contentType: string };

const typedAudioOf = (snapshot: DemoSnapshot): readonly TypedAudio[] => [
  ...snapshot.chapters.map((audio) => ({ audio, contentType: CHAPTER_CONTENT_TYPE })),
  ...snapshot.prompts.map((audio) => ({ audio, contentType: WAV_CONTENT_TYPE })),
];

const readObject = async (storage: ObjectStorage, { audio, contentType }: TypedAudio) => {
  const bytes = await readObjectBytes(storage, audio.storageKey);
  return { audio, object: { key: audio.storageKey, contentType, bytes } };
};

export const exportDemoVoice =
  (deps: DemoTransferDeps) =>
  async (voiceId: string): Promise<DemoExport> => {
    const snapshot = await deps.repo.readVoice(voiceId);
    if (snapshot === null) return { kind: "no_active_voice" };
    const missing = missingProvenance(snapshot.consent);
    if (missing.length > 0) return { kind: "missing_provenance", fields: missing };
    const read = await Promise.all(typedAudioOf(snapshot).map((typed) => readObject(deps.storage, typed)));
    const corrupt = read.find(({ audio, object }) => !matchesStoredAudio(audio, object.bytes));
    if (corrupt !== undefined) return { kind: "corrupt_object", key: corrupt.audio.storageKey };
    return { kind: "exported", snapshot, objects: read.map(({ object }) => object) };
  };
