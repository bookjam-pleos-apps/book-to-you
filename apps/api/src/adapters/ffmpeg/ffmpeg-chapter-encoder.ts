import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AudioRange, ChapterEncoder, ChapterMetadata } from "../../application/ports/chapter-encoder";
import { ffmpegSeconds, probeDurationMs, runFile, withTempDirectory } from "./ffmpeg-files";

const AAC_BITRATE = "96k";
const SAFE_WAV_INPUT = ["-protocol_whitelist", "file", "-format_whitelist", "wav"];

export type ChapterEncoderOptions = {
  readonly timeoutMs: number;
};

// -i 뒤에 두어 디코딩한 뒤 자른다. 샘플 단위로 정확하다.
const rangeArgs = (range: AudioRange | undefined): readonly string[] => {
  if (range === undefined) return [];
  const end = range.endMs === null ? [] : ["-to", ffmpegSeconds(range.endMs)];
  return ["-ss", ffmpegSeconds(range.startMs), ...end];
};

// comment는 대부분의 플레이어와 ffprobe가 읽는 표준 태그다. 고지가 파일을 따라다니도록 두 태그에 함께 쓴다.
const encodeArgs = (input: string, output: string, { title, aiNotice }: ChapterMetadata, range?: AudioRange): readonly string[] => [
  "-nostdin", "-hide_banner", "-v", "error", ...SAFE_WAV_INPUT, "-i", input, ...rangeArgs(range),
  "-vn", "-ac", "1", "-c:a", "aac", "-b:a", AAC_BITRATE,
  "-metadata", `title=${title}`, "-metadata", `comment=${aiNotice}`, "-metadata", `description=${aiNotice}`,
  "-movflags", "+faststart", "-f", "mp4", output,
];

export const createFfmpegChapterEncoder = ({ timeoutMs }: ChapterEncoderOptions): ChapterEncoder => ({
  encode: (wav, metadata, range) =>
    withTempDirectory("voice-storybook-chapter-", async (directory) => {
      const [input, output] = [join(directory, "story.wav"), join(directory, "chapter.m4a")];
      await writeFile(input, wav);
      await runFile("ffmpeg", [...encodeArgs(input, output, metadata, range)], { timeout: timeoutMs, killSignal: "SIGKILL" });
      return { bytes: await readFile(output), durationMs: await probeDurationMs(output, timeoutMs) };
    }),
});
