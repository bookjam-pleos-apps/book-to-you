import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SilenceFinder } from "../../application/ports/silence-finder";
import type { Silence } from "../../domain/renders/chapter-plan";
import { MP4_FORMATS, runFile, withTempDirectory } from "./ffmpeg-files";

// 렌더러가 넣는 쉼은 디지털 0이라 AAC로 인코딩한 뒤에도 -90dB 아래에 머문다. 모델이 낸 쉼은 그보다 시끄럽다.
// 문단 쉼은 900ms, 그 밖의 쉼은 450ms 이하라 600ms로 가른다(시연 세 편 여섯 렌더에서 개수 일치).
const NOISE_DB = -90;
const MIN_SILENCE_MS = 600;
// 게시는 wav, 이미 올린 장을 나눌 때는 m4a를 읽는다.
const SAFE_INPUT = ["-protocol_whitelist", "file", "-format_whitelist", `wav,${MP4_FORMATS}`];

export type SilenceFinderOptions = {
  readonly timeoutMs: number;
};

const detectArgs = (input: string): readonly string[] => [
  "-nostdin", "-hide_banner", "-nostats", "-v", "info", ...SAFE_INPUT, "-i", input,
  "-af", `silencedetect=noise=${NOISE_DB}dB:d=${MIN_SILENCE_MS / 1000}`, "-f", "null", "-",
];

const toMs = (seconds: string): number => Math.round(Number.parseFloat(seconds) * 1000);

const timesAfter = (log: string, label: string): readonly number[] =>
  [...log.matchAll(new RegExp(`${label}: (-?[\\d.]+)`, "g"))].map((match) => toMs(match[1] ?? "0"));

// ffmpeg 버전에 따라 파일 끝까지 이어진 무음은 silence_end 없이 끝난다. 그 무음도 최소 길이만큼은 이어진 것으로 센다.
export const parseSilences = (log: string): readonly Silence[] => {
  const ends = timesAfter(log, "silence_end");
  return timesAfter(log, "silence_start").map((start, index) => {
    const startMs = Math.max(start, 0);
    return { startMs, endMs: ends[index] ?? startMs + MIN_SILENCE_MS };
  });
};

export const createFfmpegSilenceFinder = ({ timeoutMs }: SilenceFinderOptions): SilenceFinder => ({
  findParagraphSilences: (audio) =>
    withTempDirectory("voice-storybook-silence-", async (directory) => {
      const input = join(directory, "audio");
      await writeFile(input, audio);
      const { stderr } = await runFile("ffmpeg", [...detectArgs(input)], { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 });
      return parseSilences(stderr);
    }),
});
