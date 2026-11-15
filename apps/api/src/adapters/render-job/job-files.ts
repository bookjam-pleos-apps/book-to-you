import type { Style } from "@voice-storybook/shared/vocab";
import { z } from "zod";

import type { RenderJob } from "../../application/renders/ports";
import type { ReportLine } from "../../domain/renders/render-report";

export const JOB_FILE = "job.json";
// GPU 쪽(spike.render.job.render_job)이 이 번호가 아니면 렌더를 시작하지 않는다. 계약이 어긋나면 조용히 calm으로 읽지 않게 한다.
export const RENDER_JOB_FORMAT = 2;
export const REPORT_FILE = "out/report.json";
export const STORY_FILE = "out/story.wav";

const reportSchema = z.array(z.object({ text: z.string(), passed: z.boolean() }));

export type JobFile = { readonly name: string; readonly bytes: Uint8Array };

export const referenceFileOf = (style: Style): string => `reference-${style}.wav`;

const toJobFile = (job: RenderJob) => ({
  format: RENDER_JOB_FORMAT,
  ...job,
  references: job.references.map((reference) => ({ ...reference, file: referenceFileOf(reference.style) })),
});

const referenceFilesOf = (job: RenderJob, referenceWavs: ReadonlyMap<Style, Uint8Array>): readonly JobFile[] => {
  const files = job.references.flatMap(({ style }) => {
    const bytes = referenceWavs.get(style);
    return bytes === undefined ? [] : [{ name: referenceFileOf(style), bytes }];
  });
  if (files.length !== job.references.length) throw new Error(`참조 녹음이 빠진 작업은 쓰지 않는다: ${job.renderId}`);
  return files;
};

// 작업 폴더나 묶음에 들어갈 파일 전부. 참조 녹음이 빠지면 만들지 않는다.
export const renderJobFiles = (job: RenderJob, referenceWavs: ReadonlyMap<Style, Uint8Array>): readonly JobFile[] => {
  const references = referenceFilesOf(job, referenceWavs);
  const jobFile = { name: JOB_FILE, bytes: new TextEncoder().encode(JSON.stringify(toJobFile(job), null, 1)) };
  return [jobFile, ...references];
};

export const parseRenderReport = (bytes: Uint8Array): readonly ReportLine[] => reportSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
