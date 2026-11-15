export class ObjectMissing extends Error {
  override readonly name = "ObjectMissing";
}

export type ByteRange = {
  readonly start: number;
  readonly end: number;
};

export type StoredObjectInfo = {
  readonly key: string;
  readonly lastModified: Date;
};

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(key: string, range?: ByteRange): Promise<ReadableStream<Uint8Array>>;
  list(prefix: string): Promise<readonly StoredObjectInfo[]>;
  deletePrefix(prefix: string): Promise<void>;
  deleteKeys(keys: readonly string[]): Promise<void>;
}

export const readObjectBytes = async (storage: ObjectStorage, key: string): Promise<Uint8Array> =>
  new Uint8Array(await new Response(await storage.read(key)).arrayBuffer());
