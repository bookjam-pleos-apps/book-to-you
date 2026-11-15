import { describe, expect, it } from "vitest";

import { ObjectMissing, type ObjectStorage } from "../../../application/ports/object-storage";

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

const textOf = async (stream: ReadableStream<Uint8Array>): Promise<string> => new Response(stream).text();

export const describeObjectStorage = (name: string, storage: ObjectStorage, keyPrefix: string): void => {
  describe(`${name} storage`, () => {
    it("reads back what was put, whole and by range", async () => {
      const key = `${keyPrefix}read/a.bin`;
      await storage.put(key, bytesOf("0123456789"), "application/octet-stream");
      expect(await textOf(await storage.read(key))).toBe("0123456789");
      expect(await textOf(await storage.read(key, { start: 2, end: 4 }))).toBe("234");
    });

    it("tells a missing object apart from a storage failure", async () => {
      await expect(storage.read(`${keyPrefix}read/missing.bin`)).rejects.toBeInstanceOf(ObjectMissing);
    });

    it("lists only the prefix", async () => {
      await storage.put(`${keyPrefix}list/a/1`, bytesOf("1"), "text/plain");
      await storage.put(`${keyPrefix}list/b/1`, bytesOf("1"), "text/plain");
      const listed = await storage.list(`${keyPrefix}list/a/`);
      expect(listed.map((object) => object.key)).toEqual([`${keyPrefix}list/a/1`]);
      expect(listed[0]?.lastModified).toBeInstanceOf(Date);
    });

    it("deletes a whole prefix and nothing else", async () => {
      await storage.put(`${keyPrefix}del/a/1`, bytesOf("1"), "text/plain");
      await storage.put(`${keyPrefix}del/a/2`, bytesOf("2"), "text/plain");
      await storage.put(`${keyPrefix}del/b/1`, bytesOf("3"), "text/plain");
      await storage.deletePrefix(`${keyPrefix}del/a/`);
      expect(await storage.list(`${keyPrefix}del/a/`)).toEqual([]);
      expect(await storage.list(`${keyPrefix}del/b/`)).toHaveLength(1);
    });

    it("deletes exact keys without touching a longer key that shares the prefix", async () => {
      await storage.put(`${keyPrefix}exact/a.wav`, bytesOf("1"), "text/plain");
      await storage.put(`${keyPrefix}exact/a.wav.bak`, bytesOf("2"), "text/plain");
      await storage.deleteKeys([`${keyPrefix}exact/a.wav`]);
      const left = await storage.list(`${keyPrefix}exact/`);
      expect(left.map((object) => object.key)).toEqual([`${keyPrefix}exact/a.wav.bak`]);
    });

    it("treats deleting an empty prefix as done", async () => {
      await expect(storage.deletePrefix(`${keyPrefix}nothing/`)).resolves.toBeUndefined();
    });
  });
};
