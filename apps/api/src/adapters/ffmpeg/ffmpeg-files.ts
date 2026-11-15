import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export const runFile = promisify(execFile);

// 장 파일(AAC in MP4)을 읽을 때 허용하는 형식이다. 그 밖의 형식(재생 목록 등)으로 다른 파일을 읽지 못하게 막는다.
export const MP4_FORMATS = "mov,mp4,m4a,3gp,3g2,mj2";

export const ffmpegSeconds = (ms: number): string => (ms / 1000).toFixed(3);

export const probeDurationMs = async (path: string, timeout: number): Promise<number> => {
  const { stdout } = await runFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { timeout });
  return Math.round(Number.parseFloat(stdout.trim()) * 1000);
};

// 작업이 끝나면 성공·실패와 상관없이 임시 폴더를 지운다.
export const withTempDirectory = async <T>(prefix: string, work: (directory: string) => Promise<T>): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
