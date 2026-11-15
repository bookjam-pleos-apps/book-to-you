import { decideRange } from "../../domain/library/byte-range";
import type { ByteRange, ObjectStorage } from "../ports/object-storage";
import type { LibraryRepo } from "./ports";

export type OpenAudioDeps = {
  readonly library: LibraryRepo;
  readonly storage: ObjectStorage;
};

export type OpenAudioInput = {
  readonly audioId: string;
  readonly userId: string;
  readonly rangeHeader: string | undefined;
  readonly headOnly: boolean;
};

type AudioMeta = {
  readonly totalBytes: number;
  readonly sha256: string;
  readonly contentType: string;
};

export type OpenedAudio = AudioMeta & {
  readonly range: ByteRange | null;
  readonly body: ReadableStream<Uint8Array> | null;
};

export type OpenAudioResult =
  | { readonly kind: "not_found" }
  | ({ readonly kind: "unsatisfiable" } & AudioMeta)
  | ({ readonly kind: "opened" } & OpenedAudio);

// 요청마다 소유자와 활성 동의를 DB에서 다시 확인한다. 철회하면 다음 요청부터 바로 404다.
export const openAudio =
  ({ library, storage }: OpenAudioDeps) =>
  async ({ audioId, userId, rangeHeader, headOnly }: OpenAudioInput): Promise<OpenAudioResult> => {
    const audio = await library.findPlayableAudio(audioId, userId);
    if (audio === null) return { kind: "not_found" };
    const meta = { totalBytes: audio.bytes, sha256: audio.sha256, contentType: audio.contentType };
    const decision = decideRange(rangeHeader, audio.bytes);
    if (decision.kind === "unsatisfiable") return { kind: "unsatisfiable", ...meta };
    const range = decision.kind === "partial" ? { start: decision.start, end: decision.end } : null;
    if (headOnly) return { kind: "opened", ...meta, range, body: null };
    const body = await storage.read(audio.storageKey, range ?? undefined);
    return { kind: "opened", ...meta, range, body };
  };
