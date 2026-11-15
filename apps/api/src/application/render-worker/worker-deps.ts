import type { WorkerPolicy } from "../../domain/render-worker/render-worker-plan";
import type { ObjectStorage } from "../ports/object-storage";
import type { PrepareDeps, PublishRenderInput, PublishRenderResult, RenderRepo } from "../renders";
import type { RenderEngine, RenderWorkerRepo } from "./ports";

export type WorkerEvent =
  | "claimed"
  | "not_claimed"
  | "submitted"
  | "published"
  | "not_published"
  | "stopped"
  | "resubmitting"
  | "cleaned"
  | "step_failed";

export type WorkerLog = (event: WorkerEvent, fields: { readonly renderId?: string | undefined; readonly detail?: string }) => void;

// 이야기·대본·렌더 정책은 렌더 준비(renders)가 정한 모양을 그대로 받는다.
export type WorkerDeps = Pick<PrepareDeps, "stories" | "scripts" | "policy"> & {
  readonly worker: RenderWorkerRepo;
  readonly renders: Pick<RenderRepo, "findSource" | "fail" | "priorFailures">;
  readonly engine: RenderEngine;
  readonly storage: ObjectStorage;
  readonly workerPolicy: WorkerPolicy;
  readonly publish: (input: PublishRenderInput) => Promise<PublishRenderResult>;
  readonly log: WorkerLog;
};

// 워커가 기억하는 지금 렌더. 행이 사라지면(음성 삭제 cascade) 이것으로 장비의 task와 폴더를 정리한다.
export type Tracked = { readonly renderId: string; readonly taskId: string | null };
