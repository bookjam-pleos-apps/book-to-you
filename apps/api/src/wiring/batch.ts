import type { Database } from "../adapters/db/client";
import { createRenderQueueRepo } from "../adapters/db/repos/render-queue-repo";
import { createRenderRepo } from "../adapters/db/repos/render-repo";
import { readRenderOutput, removeRenderJob, writeRenderJob } from "../adapters/render-job/job-folder";
import type { ChapterEncoder } from "../application/ports/chapter-encoder";
import type { Clock } from "../application/ports/clock";
import type { ObjectStorage } from "../application/ports/object-storage";
import type { SilenceFinder } from "../application/ports/silence-finder";
import { publishRender, startBatchRender, type PublishRenderInput, type PublishRenderResult, type StartBatchInput, type StartBatchResult } from "../application/renders";
import type { StoryContents } from "../application/stories";
import type { RecordingScripts } from "../application/recording-scripts";
import { POLICY } from "../config";

export type AbandonResult = { readonly kind: "abandon"; readonly renderId: string; readonly abandoned: boolean };

export type BatchInfrastructure = {
  readonly database: Database;
  readonly storage: ObjectStorage;
  readonly stories: StoryContents;
  readonly scripts: RecordingScripts;
  readonly encoder: ChapterEncoder;
  readonly silences: SilenceFinder;
  readonly clock: Clock;
  readonly aiNoticeVersion: string;
};

export const aiNoticeTag = (version: string): string => `${POLICY.batchRender.aiNotice} (ai-notice ${version})`;

export const wireBatchRender = ({ database, storage, stories, scripts, encoder, silences, clock, aiNoticeVersion }: BatchInfrastructure) => {
  const renders = createRenderRepo(database);
  const queue = createRenderQueueRepo(database);
  return {
    queued: () => queue.listPending(),
    abandon: async (renderId: string) => ({ kind: "abandon" as const, renderId, abandoned: await queue.abandon(renderId, clock()) }),
    start: startBatchRender({ renders, stories, storage, scripts, clock, policy: POLICY.batchRender }),
    publish: publishRender({ renders, stories, encoder, silences, storage, clock, aiNotice: aiNoticeTag(aiNoticeVersion) }),
  };
};

type BatchSteps = {
  readonly start: (input: StartBatchInput) => Promise<StartBatchResult>;
  readonly publish: (input: PublishRenderInput) => Promise<PublishRenderResult>;
};

// 게시 결과가 나오면 무엇이든 음성이 든 폴더를 지운다. 음성이 삭제되어 렌더가 사라진 경우에도 남으면 안 된다.
// 예외(저장소, 인코더 장애)만 폴더를 남겨 같은 폴더로 다시 게시할 수 있게 한다.
export const withJobFolder = <Rest extends object>({ start, publish, ...rest }: BatchSteps & Rest) => ({
  ...rest,
  start: async (input: StartBatchInput, jobDirectory: string) => {
    const result = await start(input);
    if (result.kind !== "started") return result;
    await writeRenderJob(jobDirectory, result.job, result.referenceWavs);
    return { kind: result.kind, renderId: result.job.renderId };
  },
  publish: async (jobDirectory: string) => {
    const result = await publish(await readRenderOutput(jobDirectory));
    await removeRenderJob(jobDirectory);
    return result;
  },
});
