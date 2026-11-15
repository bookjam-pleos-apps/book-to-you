import { describe, expect, it } from "vitest";

import { pausedRecording, toneRecording } from "../../testing/audio-fixtures";
import { createFfmpegChapterEncoder } from "./ffmpeg-chapter-encoder";
import { createFfmpegSilenceFinder, parseSilences } from "./ffmpeg-silence-finder";

const finder = createFfmpegSilenceFinder({ timeoutMs: 30_000 });

describe("ffmpeg silence finder", () => {
  it("finds a paragraph pause and ignores short gaps between words", async () => {
    const silences = await finder.findParagraphSilences(pausedRecording(3, { atSeconds: 1, seconds: 0.9 }));
    expect(silences).toHaveLength(1);
    expect(silences[0]!.startMs).toBeGreaterThan(950);
    expect(silences[0]!.endMs).toBeLessThan(1950);
    expect(await finder.findParagraphSilences(toneRecording({ seconds: 3 }))).toEqual([]);
  });

  it("still finds the pause after aac encoding", async () => {
    const encoder = createFfmpegChapterEncoder({ timeoutMs: 30_000 });
    const encoded = await encoder.encode(pausedRecording(3, { atSeconds: 1, seconds: 0.9 }), { title: "t", aiNotice: "n" });
    expect(await finder.findParagraphSilences(encoded.bytes)).toHaveLength(1);
  });

  it("pairs starts and ends from the ffmpeg log", () => {
    const log = "[silencedetect] silence_start: 1.0\n[silencedetect] silence_end: 1.9 | silence_duration: 0.9\n";
    expect(parseSilences(log)).toEqual([{ startMs: 1000, endMs: 1900 }]);
  });

  it("counts a silence that runs to the end of the file without an end line", () => {
    const log = "[silencedetect] silence_start: 1.0\n[silencedetect] silence_end: 1.9 | silence_duration: 0.9\n[silencedetect] silence_start: 5.2\n";
    expect(parseSilences(log)).toEqual([{ startMs: 1000, endMs: 1900 }, { startMs: 5200, endMs: 5800 }]);
  });
});
