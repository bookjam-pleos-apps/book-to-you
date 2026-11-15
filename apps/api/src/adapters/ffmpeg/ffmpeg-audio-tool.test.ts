import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { measureSignal } from "../../domain/voices/signal-qc";
import { silentRecording, toneRecording } from "../../testing/audio-fixtures";
import { join } from "node:path";
import {
  createFfmpegAudioTool,
  REFERENCE_FILTERS,
  SAMPLE_RATE,
  sweepAbandonedUploads,
  TEMP_DIR_PREFIX,
} from "./ffmpeg-audio-tool";

const tool = createFfmpegAudioTool({ timeoutMs: 20_000, concurrency: 2, maxInputSec: 30 });

const prepare = async (upload: Uint8Array) => {
  const prepared = await tool.prepare(upload);
  if (prepared === null) throw new Error("expected audio to be readable");
  return prepared;
};

describe("ffmpeg audio tool", () => {
  let tone: Uint8Array;

  beforeAll(() => {
    tone = toneRecording({ seconds: 12 });
  });

  it("keeps the same filters the spike measured", () => {
    const spike = readFileSync(resolve(import.meta.dirname, "../../../../../gpu/spike/src/spike/clone/reference/ref_prep.py"), "utf8");
    expect(spike).toContain("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05");
    expect(spike).toContain("loudnorm=I=-20:TP=-2:LRA=11");
    expect(REFERENCE_FILTERS).toContain("loudnorm=I=-20:TP=-2:LRA=11");
    expect(REFERENCE_FILTERS).toContain("apad=pad_dur=0.5");
  });

  it("converts to 24kHz mono 16-bit wav", async () => {
    const { wav, sampleRate } = await prepare(tone);
    const header = Buffer.from(wav);
    expect(sampleRate).toBe(SAMPLE_RATE);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 36, 40)).toBe("data");
    expect(header.readUInt16LE(22)).toBe(1);
    expect(header.readUInt32LE(24)).toBe(24_000);
    expect(header.readUInt16LE(34)).toBe(16);
  });

  it("measures length after trimming silence and without the tail pad", async () => {
    const { durationMs } = await prepare(tone);
    expect(durationMs).toBeGreaterThan(11_500);
    expect(durationMs).toBeLessThan(12_100);
  });

  it("measures the signal before loudness normalization hides clipping", async () => {
    const { samples, sampleRate } = await prepare(toneRecording({ seconds: 12, amplitude: 2 }));
    expect(measureSignal(samples, sampleRate).clippedRatio).toBeGreaterThan(0.01);
  });

  it.each(["m4a", "webm"] as const)("reads a browser %s recording", async (extension) => {
    const { durationMs } = await prepare(toneRecording({ seconds: 12, extension }));
    expect(durationMs).toBeGreaterThan(11_000);
  });

  it("stops reading a recording longer than the input limit", async () => {
    const limited = createFfmpegAudioTool({ timeoutMs: 20_000, concurrency: 1, maxInputSec: 3 });
    const prepared = await limited.prepare(tone);
    expect(prepared?.samples.length).toBeLessThanOrEqual(3 * SAMPLE_RATE);
  });

  it("gives a silent recording almost no length", async () => {
    const { durationMs } = await prepare(silentRecording(12));
    expect(durationMs).toBeLessThan(1000);
  });

  it("rejects something that is not audio", async () => {
    expect(await tool.prepare(new TextEncoder().encode("not audio at all"))).toBeNull();
  });

  it("refuses a playlist that points at a local file", async () => {
    const playlist = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n";
    expect(await tool.prepare(new TextEncoder().encode(playlist))).toBeNull();
  });

  it("surfaces a missing tool instead of calling the upload unreadable", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "voice-storybook-root-"));
    const broken = createFfmpegAudioTool({
      timeoutMs: 20_000,
      concurrency: 1,
      maxInputSec: 30,
      tempRoot,
      tools: { ffmpeg: "ffmpeg", ffprobe: "/nonexistent/ffprobe" },
    });
    await expect(broken.prepare(tone)).rejects.toThrow(/ENOENT/);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it("surfaces a timeout instead of calling the upload unreadable", async () => {
    const slow = createFfmpegAudioTool({ timeoutMs: 1, concurrency: 1, maxInputSec: 30 });
    await expect(slow.prepare(tone)).rejects.toThrow();
  });

  it("leaves no temporary files behind", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "voice-storybook-root-"));
    const isolated = createFfmpegAudioTool({ timeoutMs: 20_000, concurrency: 1, maxInputSec: 30, tempRoot });
    await isolated.prepare(tone);
    await isolated.prepare(new TextEncoder().encode("not audio"));
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it("removes uploads abandoned by a crash and nothing else at startup", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "voice-storybook-root-"));
    mkdirSync(join(tempRoot, `${TEMP_DIR_PREFIX}abandoned`));
    writeFileSync(join(tempRoot, `${TEMP_DIR_PREFIX}abandoned`, "upload"), "raw voice");
    writeFileSync(join(tempRoot, "unrelated"), "keep");
    await sweepAbandonedUploads(tempRoot);
    expect(readdirSync(tempRoot)).toEqual(["unrelated"]);
  });
});
