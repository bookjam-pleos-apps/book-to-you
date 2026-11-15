import type { ChapterRole, Style } from "@voice-storybook/shared/vocab";

import type { ReadAs } from "../../domain/renders/reference-plan";
import type { RenderFailureCode } from "../../domain/renders/render-failure";
import type { InProgressStatus, RenderRow } from "../../domain/renders/render-status";
import type { StoryLine } from "../../domain/stories/story-version";

export interface RenderListRepo {
  // 상태와 무관하게 사용자의 렌더를 모두 돌려준다. 쌍마다 하나로 줄이는 것은 도메인이 한다.
  listRenderRows(userId: string): Promise<readonly RenderRow[]>;
}

export type QueueOutcome =
  | { readonly kind: "queued" | "existing"; readonly row: RenderRow }
  | { readonly kind: "no_active_consent" | "too_many_pending" };

export type PendingRender = {
  readonly renderId: string;
  readonly voiceId: string;
  readonly storyId: string;
  readonly status: InProgressStatus;
  readonly startedAt: Date | null;
  readonly attempts: number;
};

export interface RenderQueueRepo {
  // 같은 쌍에 진행 중인 렌더나 같은 키의 성공 렌더가 있으면 새로 만들지 않고 그것을 돌려준다.
  enqueue(render: NewRender, maxPending: number): Promise<QueueOutcome>;
  listPending(): Promise<readonly PendingRender[]>;
  // 갇힌 대기·진행 렌더를 실패로 돌려 부모가 다시 요청할 수 있게 한다. 대기나 진행 중이 아니면 false.
  abandon(renderId: string, now: Date): Promise<boolean>;
}

export type RenderClip = {
  readonly id: string;
  readonly style: Style;
  readonly storageKey: string;
  readonly scriptId: string;
  readonly scriptVersion: string;
};

export type RenderSource = {
  readonly userId: string;
  readonly consentActive: boolean;
  readonly passedClips: readonly RenderClip[];
};

export type NewRender = {
  readonly userId: string;
  readonly voiceId: string;
  readonly storyId: string;
  readonly storyVersion: string;
  readonly renderKey: string;
  readonly refClipIds: readonly string[];
  readonly engineId: string;
  readonly engineVersion: string;
  readonly chaptersTotal: number;
  readonly startedAt: Date;
};

export type RenderBegun =
  | { readonly kind: "started"; readonly renderId: string }
  | { readonly kind: "already_running" | "already_rendered"; readonly renderId: string }
  | { readonly kind: "no_active_consent" };

export type RenderCompletion = "completed" | "not_running" | "no_active_consent";

export type RenderJob = {
  readonly renderId: string;
  readonly storyId: string;
  readonly model: string;
  readonly seed: number;
  readonly limits: { readonly maxSyllables: number; readonly minSyllables: number };
  // 참조 style마다 녹음 대본 하나. 녹음 파일 이름과 작업 파일 형식은 작업 폴더 어댑터가 정한다.
  readonly references: readonly JobReference[];
  readonly readAs: ReadAs;
  readonly lines: readonly StoryLine[];
};

export type JobReference = {
  readonly style: Style;
  readonly text: string;
};

export type RunningRender = {
  readonly userId: string;
  readonly voiceId: string;
  readonly storyId: string;
  readonly storyVersion: string;
};

export type FinishedChapter = {
  readonly index: number;
  readonly role: ChapterRole;
  readonly title: string | null;
  readonly storageKey: string;
  readonly durationMs: number;
  readonly bytes: number;
  readonly sha256: string;
};

export interface RenderRepo {
  // 모든 style의 통과 녹음을 돌려준다. 어떤 녹음을 쓸지는 유스케이스가 정한다.
  findSource(voiceId: string): Promise<RenderSource | null>;
  begin(render: NewRender, resume: boolean): Promise<RenderBegun>;
  findRunning(renderId: string): Promise<RunningRender | null>;
  complete(renderId: string, running: RunningRender, chapters: readonly FinishedChapter[], now: Date): Promise<RenderCompletion>;
  fail(renderId: string, errorCode: RenderFailureCode, now: Date): Promise<void>;
  // 같은 사용자·목소리·이야기에서 앞서 렌더하다 실패한 수. 다시 렌더할 때 seed를 옮기는 데 쓴다.
  priorFailures(renderId: string): Promise<number>;
}
