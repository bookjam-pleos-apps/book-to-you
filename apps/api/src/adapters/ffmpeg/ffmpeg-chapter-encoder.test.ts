import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toneRecording } from "../../testing/audio-fixtures";
import { createFfmpegChapterEncoder } from "./ffmpeg-chapter-encoder";

const run = promisify(execFile);
const probeSchema = z.object({
  format: z.object({ tags: z.record(z.string(), z.string()) }),
  streams: z.array(z.object({ codec_name: z.string() })),
});

const probe = async (bytes: Uint8Array) => {
  const directory = await mkdtemp(join(tmpdir(), "chapter-test-"));
  const path = join(directory, "chapter.m4a");
  try {
    await writeFile(path, bytes);
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path]);
    return probeSchema.parse(JSON.parse(stdout));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe("ffmpeg chapter encoder", () => {
  it("writes an aac chapter that carries the title and the AI notice", async () => {
    const encoder = createFfmpegChapterEncoder({ timeoutMs: 30_000 });
    const aiNotice = "이 음성은 AI로 생성했습니다 (ai-notice 2026-11)";
    const chapter = await encoder.encode(toneRecording({ seconds: 2 }), { title: "빨간 모자", aiNotice });
    const { format, streams } = await probe(chapter.bytes);
    expect(streams[0]?.codec_name).toBe("aac");
    expect(format.tags).toMatchObject({ title: "빨간 모자", comment: aiNotice, description: aiNotice });
    expect(chapter.durationMs).toBeGreaterThan(1900);
    expect(chapter.durationMs).toBeLessThan(2200);
  });

  it("encodes only the asked range, to the end when it is open", async () => {
    const encoder = createFfmpegChapterEncoder({ timeoutMs: 30_000 });
    const wav = toneRecording({ seconds: 3 });
    const middle = await encoder.encode(wav, { title: "t", aiNotice: "n" }, { startMs: 500, endMs: 1500 });
    const tail = await encoder.encode(wav, { title: "t", aiNotice: "n" }, { startMs: 2000, endMs: null });
    expect(Math.abs(middle.durationMs - 1000)).toBeLessThan(80);
    expect(Math.abs(tail.durationMs - 1000)).toBeLessThan(80);
  });

  it("refuses input that is not a wav file", async () => {
    const encoder = createFfmpegChapterEncoder({ timeoutMs: 30_000 });
    const notAudio = new TextEncoder().encode("#EXTM3U\nfile:///etc/passwd\n");
    await expect(encoder.encode(notAudio, { title: "t", aiNotice: "n" })).rejects.toThrow();
  });
});
