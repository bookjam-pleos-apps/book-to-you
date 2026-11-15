import { ObjectMissing, type ObjectStorage } from "../../application/ports/object-storage";

type Stored = { readonly bytes: Uint8Array; readonly lastModified: Date };

const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(bytes);
      controller.close();
    },
  });

export type InMemoryStorage = ObjectStorage & { readonly keys: () => readonly string[] };

export const createInMemoryStorage = (now: () => Date = () => new Date()): InMemoryStorage => {
  const objects = new Map<string, Stored>();
  return {
    put: async (key, bytes) => {
      objects.set(key, { bytes, lastModified: now() });
    },
    read: async (key, range) => {
      const stored = objects.get(key);
      if (stored === undefined) throw new ObjectMissing(`no such object: ${key}`);
      return streamOf(range === undefined ? stored.bytes : stored.bytes.slice(range.start, range.end + 1));
    },
    list: async (prefix) =>
      [...objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, stored]) => ({ key, lastModified: stored.lastModified })),
    deletePrefix: async (prefix) => {
      [...objects.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => objects.delete(key));
    },
    deleteKeys: async (keys) => {
      keys.forEach((key) => objects.delete(key));
    },
    keys: () => [...objects.keys()],
  };
};
