import { describe, expect, it } from "vitest";

import { toneRecording } from "../../testing/audio-fixtures";
import { createFfmpegAudioCutter } from "./ffmpeg-audio-cutter";
import { createFfmpegChapterEncoder } from "./ffmpeg-chapter-encoder";

describe("ffmpeg audio cutter", () => {
  it("splits an aac chapter into parts that add back up to the whole", async () => {
    const encoder = createFfmpegChapterEncoder({ timeoutMs: 30_000 });
    const cutter = createFfmpegAudioCutter({ timeoutMs: 30_000 });
    const whole = await encoder.encode(toneRecording({ seconds: 4 }), { title: "t", aiNotice: "n" });
    const head = await cutter.cut(whole.bytes, { startMs: 0, endMs: 1500 });
    const tail = await cutter.cut(whole.bytes, { startMs: 1500, endMs: null });
    expect(Math.abs(head.durationMs - 1500)).toBeLessThan(60);
    expect(Math.abs(head.durationMs + tail.durationMs - whole.durationMs)).toBeLessThan(60);
  });
});
