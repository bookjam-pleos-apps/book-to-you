import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseRenderReport, REPORT_FILE, STORY_FILE } from "./job-files";
import { packUstar, unpackUstar } from "./ustar";

const FIXTURES = join(import.meta.dirname, "fixtures");
const fixture = async (name: string): Promise<Uint8Array> => new Uint8Array(await readFile(join(FIXTURES, name)));

describe("ustar", () => {
  it("packs the bundle byte for byte as the GPU side test reads it", async () => {
    const files = [
      { name: "job.json", bytes: await fixture("job.example.json") },
      { name: "reference-calm.wav", bytes: new Uint8Array([82, 73, 70, 70]) },
    ];

    expect(packUstar(files)).toEqual(await fixture("bundle.example.tar"));
  });

  it("reads the result the GPU side packs", async () => {
    const entries = unpackUstar(await fixture("result.example.tar"));

    expect([...entries.keys()]).toEqual([REPORT_FILE, STORY_FILE]);
    expect(parseRenderReport(entries.get(REPORT_FILE) ?? new Uint8Array())).toEqual(parseRenderReport(await fixture("report.example.json")));
    expect(new TextDecoder().decode(entries.get(STORY_FILE))).toBe("RIFFstory");
  });

  it("round-trips sizes that are not block multiples, including empty files", () => {
    const files = [
      { name: "a", bytes: new Uint8Array(513).fill(7) },
      { name: "b", bytes: new Uint8Array() },
    ];

    expect(unpackUstar(packUstar(files))).toEqual(new Map(files.map(({ name, bytes }) => [name, bytes])));
  });

  it("refuses links and folders", () => {
    const packed = packUstar([{ name: "out", bytes: new Uint8Array() }]);
    packed[156] = 0x35;

    expect(() => unpackUstar(packed)).toThrow(/일반 파일이 아닌/);
  });

  it("refuses an entry cut short", () => {
    const packed = packUstar([{ name: "a", bytes: new Uint8Array(600) }]);

    expect(() => unpackUstar(packed.slice(0, 700))).toThrow(/잘렸다/);
  });

  it("refuses a bundle with more entries than a render ever has", () => {
    const files = Array.from({ length: 65 }, (_, index) => ({ name: `f${index}`, bytes: new Uint8Array(0) }));
    expect(() => unpackUstar(packUstar(files))).toThrow("64개");
    expect(unpackUstar(packUstar(files.slice(0, 64))).size).toBe(64);
  });
});
