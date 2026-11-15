import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Style } from "@voice-storybook/shared/vocab";
import { z } from "zod";

import type { RenderJob } from "../../application/renders/ports";
import { JOB_FILE, parseRenderReport, renderJobFiles, REPORT_FILE, STORY_FILE } from "./job-files";

export { RENDER_JOB_FORMAT, referenceFileOf } from "./job-files";

const jobIdSchema = z.object({ renderId: z.string().min(1) });

// 부모 음성이 들어 있는 폴더다. 다른 사용자가 읽지 못하게 하고, 이전 작업을 덮어쓰지 않는다.
export const writeRenderJob = async (directory: string, job: RenderJob, referenceWavs: ReadonlyMap<Style, Uint8Array>): Promise<void> => {
  const files = renderJobFiles(job, referenceWavs);
  if (existsSync(directory)) throw new Error(`이미 있는 작업 폴더는 쓰지 않는다: ${directory}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await Promise.all(files.map(({ name, bytes }) => writeFile(join(directory, name), bytes, { mode: 0o600 })));
};

export const readRenderOutput = async (directory: string) => {
  const { renderId } = jobIdSchema.parse(JSON.parse(await readFile(join(directory, JOB_FILE), "utf8")));
  const report = parseRenderReport(await readFile(join(directory, REPORT_FILE)));
  return { renderId, report, storyWav: await readFile(join(directory, STORY_FILE)) };
};

export const removeRenderJob = async (directory: string): Promise<void> => {
  if (!existsSync(join(directory, JOB_FILE))) throw new Error(`작업 폴더가 아니어서 지우지 않는다: ${directory}`);
  await rm(directory, { recursive: true, force: true });
};
