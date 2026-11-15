import type { Style } from "@voice-storybook/shared/vocab";

import type { EngineTaskState, WorkerRow } from "../../domain/render-worker/render-worker-plan";
import type { RenderFailureCode } from "../../domain/renders/render-failure";
import type { ReportLine } from "../../domain/renders/render-report";
import type { NewRender, RenderJob } from "../renders/ports";

export type ClaimOutcome = "claimed" | "not_queued" | "no_active_consent" | "superseded";

// 렌더 워커만 쓴다. 상태 판단은 domain/render-worker/render-worker-plan이 한다.
export interface RenderWorkerRepo {
  // 진행 중인 행과, 끝났지만 워커가 장비 정리를 마치지 않은 행.
  listWork(): Promise<readonly WorkerRow[]>;
  // 대기 행을 지금 계획(키, 녹음)으로 바꿔 가져간다. 동의가 없거나 같은 키가 이미 있으면 그 행을 실패로 돌린다.
  claim(renderId: string, render: NewRender, now: Date): Promise<ClaimOutcome>;
  failQueued(renderId: string, errorCode: RenderFailureCode, now: Date): Promise<void>;
  // 제출 횟수를 올리고 시간 초과를 다시 잰다. 워커가 잡은 running 행이 아니면 false.
  recordTask(renderId: string, taskId: string, now: Date): Promise<boolean>;
  clearTask(renderId: string): Promise<void>;
}

export type RenderOutput = {
  readonly report: readonly ReportLine[];
  readonly storyWav: Uint8Array;
};

// 렌더 장비. 닿지 않으면 taskState는 unreachable을 돌려주고, 나머지는 예외를 낸다.
export interface RenderEngine {
  submit(job: RenderJob, referenceWavs: ReadonlyMap<Style, Uint8Array>): Promise<string>;
  taskState(taskId: string): Promise<EngineTaskState>;
  // 작업 폴더에 결과가 없으면 null.
  result(renderId: string): Promise<RenderOutput | null>;
  // 이미 끝났거나 없는 task면 아무것도 하지 않는다.
  cancel(taskId: string): Promise<void>;
  // 폴더를 지웠으면 true, 이미 없었으면 false.
  cleanup(renderId: string): Promise<boolean>;
}
