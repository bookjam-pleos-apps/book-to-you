import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { AudioTool, PreparedAudio } from "../../application/ports/audio-tool";
import { createConcurrencyLimit } from "./concurrency-limit";

const run = promisify(execFile);

export const SAMPLE_RATE = 24_000;
const TAIL_PAD_SEC = 0.5;
const BYTES_PER_SAMPLE = 2;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
export const TEMP_DIR_PREFIX = "voice-storybook-upload-";

const TRIM_LEADING = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05";
// 스파이크 ref_prep.py와 같은 전처리다. 달라지면 클론 품질 측정 결과를 제품에 쓸 수 없다.
export const REFERENCE_FILTERS = [
  TRIM_LEADING,
  "areverse",
  TRIM_LEADING,
  "areverse",
  "loudnorm=I=-20:TP=-2:LRA=11",
  `apad=pad_dur=${TAIL_PAD_SEC}`,
].join(",");

// 업로드는 신뢰하지 않는다. 플레이리스트 같은 형식이 로컬 파일이나 네트워크를 읽지 못하게 막는다.
const SAFE_INPUT = ["-protocol_whitelist", "file", "-format_whitelist", "mov,mp4,m4a,matroska,webm,ogg,wav,mp3,aac,flac"];

const ffmpegArgs = (input: string, maxInputSec: number, output: readonly string[]): readonly string[] => [
  "-nostdin", "-hide_banner", "-v", "error", ...SAFE_INPUT, "-t", String(maxInputSec), "-i", input, "-vn", ...output,
];

export type FfmpegOptions = {
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly maxInputSec: number;
  readonly tempRoot?: string;
  readonly tools?: { readonly ffmpeg: string; readonly ffprobe: string };
};

const DEFAULT_TOOLS = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };

// 도구가 종료 코드를 내고 끝났다면 입력을 거부한 것이다. 미설치, 타임아웃, 출력 초과는 서버 문제이므로 그대로 올린다.
const toolRejectedInput = (error: unknown): boolean =>
  error instanceof Error && "code" in error && typeof error.code === "number";

const execTool = (tool: string, args: readonly string[], timeoutMs: number) =>
  run(tool, [...args], { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: MAX_OUTPUT_BYTES, encoding: "buffer" });

const hasAudioStream = async (path: string, options: FfmpegOptions): Promise<boolean> => {
  const args = ["-v", "error", ...SAFE_INPUT, "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", path];
  const { stdout } = await execTool((options.tools ?? DEFAULT_TOOLS).ffprobe, args, options.timeoutMs);
  return stdout.toString().trim().startsWith("audio");
};

// 신호는 필터 없이 잰다. loudnorm이 진폭을 바꿔 클리핑을 가린다.
const decodeRawSamples = async (path: string, options: FfmpegOptions): Promise<Int16Array> => {
  const output = ["-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "pipe:1"];
  const { stdout } = await execTool((options.tools ?? DEFAULT_TOOLS).ffmpeg, ffmpegArgs(path, options.maxInputSec, output), options.timeoutMs);
  const length = Math.floor(stdout.length / BYTES_PER_SAMPLE);
  return Int16Array.from({ length }, (_, index) => stdout.readInt16LE(index * BYTES_PER_SAMPLE));
};

const prepareWav = async (input: string, output: string, options: FfmpegOptions): Promise<Uint8Array> => {
  const filters = ["-af", REFERENCE_FILTERS, "-ac", "1", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le"];
  const args = [...ffmpegArgs(input, options.maxInputSec, filters), "-bitexact", "-map_metadata", "-1", output];
  await execTool((options.tools ?? DEFAULT_TOOLS).ffmpeg, args, options.timeoutMs);
  return readFile(output);
};

const WAV_HEADER_BYTES = 44;

// 길이는 무음을 뺀 결과로 잰다. 앞뒤 무음으로 10초를 채운 녹음이 통과하면 안 된다.
const voicedDurationMs = (wav: Uint8Array): number => {
  const samples = Math.max(wav.length - WAV_HEADER_BYTES, 0) / BYTES_PER_SAMPLE;
  return Math.max(Math.round((samples / SAMPLE_RATE - TAIL_PAD_SEC) * 1000), 0);
};

const prepareInDirectory = async (directory: string, upload: Uint8Array, options: FfmpegOptions): Promise<PreparedAudio | null> => {
  const input = join(directory, "upload");
  await writeFile(input, upload);
  if (!(await hasAudioStream(input, options))) return null;
  const samples = await decodeRawSamples(input, options);
  const wav = await prepareWav(input, join(directory, "prepared.wav"), options);
  return { samples, sampleRate: SAMPLE_RATE, wav, durationMs: voicedDurationMs(wav) };
};

export const createFfmpegAudioTool = (options: FfmpegOptions): AudioTool => {
  const limit = createConcurrencyLimit(options.concurrency);
  return {
    prepare: (upload) =>
      limit(async () => {
        const directory = await mkdtemp(join(options.tempRoot ?? tmpdir(), TEMP_DIR_PREFIX));
        // 원본은 어떤 경우든 지운다.
        return prepareInDirectory(directory, upload, options)
          .catch((error: unknown) => {
            if (toolRejectedInput(error)) return null;
            throw error;
          })
          .finally(() => rm(directory, { recursive: true, force: true }));
      }),
  };
};

// 처리 중에 프로세스가 죽으면 원본이 임시 폴더에 남는다. API는 프로세스 하나라 기동 시점에 남은 것은 모두 고아다.
export const sweepAbandonedUploads = async (tempRoot: string = tmpdir()): Promise<void> => {
  const names = await readdir(tempRoot);
  const abandoned = names.filter((name) => name.startsWith(TEMP_DIR_PREFIX));
  await Promise.all(abandoned.map((name) => rm(join(tempRoot, name), { recursive: true, force: true })));
};
