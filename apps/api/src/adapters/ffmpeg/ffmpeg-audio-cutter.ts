import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AudioCutter } from "../../application/ports/audio-cutter";
import type { AudioRange } from "../../application/ports/chapter-encoder";
import { ffmpegSeconds, MP4_FORMATS, probeDurationMs, runFile, withTempDirectory } from "./ffmpeg-files";

const SAFE_MP4_INPUT = ["-protocol_whitelist", "file", "-format_whitelist", MP4_FORMATS];

export type AudioCutterOptions = {
  readonly timeoutMs: number;
};

// 원본의 제목과 AI 고지 태그를 그대로 옮긴다(-map_metadata 0).
const cutArgs = (input: string, output: string, { startMs, endMs }: AudioRange): readonly string[] => [
  "-nostdin", "-hide_banner", "-v", "error", ...SAFE_MP4_INPUT, "-i", input,
  "-ss", ffmpegSeconds(startMs), ...(endMs === null ? [] : ["-to", ffmpegSeconds(endMs)]),
  "-map", "0:a", "-map_metadata", "0", "-c", "copy", "-movflags", "+faststart", "-f", "mp4", output,
];

export const createFfmpegAudioCutter = ({ timeoutMs }: AudioCutterOptions): AudioCutter => ({
  cut: (chapter, range) =>
    withTempDirectory("voice-storybook-cut-", async (directory) => {
      const [input, output] = [join(directory, "chapter.m4a"), join(directory, "part.m4a")];
      await writeFile(input, chapter);
      await runFile("ffmpeg", [...cutArgs(input, output, range)], { timeout: timeoutMs, killSignal: "SIGKILL" });
      return { bytes: await readFile(output), durationMs: await probeDurationMs(output, timeoutMs) };
    }),
});
