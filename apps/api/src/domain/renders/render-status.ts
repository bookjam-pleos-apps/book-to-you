import { newestFirst } from "./started-order";

// 목소리와 동화 한 쌍은 화면에 한 줄이다. 여러 번 렌더한 기록을 우선순위로 하나로 줄인다.
export type RenderRowStatus = "queued" | "running" | "succeeded" | "failed";

// 끝나지 않은 렌더다. 화면 판정, 요청 상한, 운영자 대기 목록이 모두 이 정의를 쓴다.
export const IN_PROGRESS_STATUSES = ["queued", "running"] as const satisfies readonly RenderRowStatus[];

export type InProgressStatus = (typeof IN_PROGRESS_STATUSES)[number];

export const isInProgressStatus = (status: RenderRowStatus): status is InProgressStatus =>
  IN_PROGRESS_STATUSES.some((candidate) => candidate === status);

export type RenderRow = {
  readonly renderId: string;
  readonly voiceId: string;
  readonly voiceLabel: string;
  readonly storyId: string;
  readonly status: RenderRowStatus;
  readonly consentActive: boolean;
  readonly startedAt: Date | null;
};

export type PairStatus = "making" | "playable" | "failed";

export type PairSummary = {
  readonly renderId: string;
  readonly voiceId: string;
  readonly voiceLabel: string;
  readonly storyId: string;
  readonly status: PairStatus;
  readonly startedAt: Date | null;
};

const newest = (rows: readonly RenderRow[]): RenderRow | null => rows.toSorted(newestFirst)[0] ?? null;

const isInProgress = (row: RenderRow): boolean => isInProgressStatus(row.status);

const isPlayable = (row: RenderRow): boolean => row.status === "succeeded" && row.consentActive;

const summarize = (row: RenderRow, status: PairStatus): PairSummary => {
  const { renderId, voiceId, voiceLabel, storyId, startedAt } = row;
  return { renderId, voiceId, voiceLabel, storyId, status, startedAt };
};

const summarizePair = (rows: readonly RenderRow[]): PairSummary | null => {
  const making = newest(rows.filter(isInProgress));
  if (making !== null) return summarize(making, "making");
  const playable = newest(rows.filter(isPlayable));
  if (playable !== null) return summarize(playable, "playable");
  const latest = newest(rows);
  return latest === null ? null : summarize(latest, "failed");
};

// 렌더 한 행만 볼 때의 상태다. 쌍 판정과 같은 우선순위를 따른다.
export const statusOfRender = (row: RenderRow): PairStatus => {
  if (isInProgress(row)) return "making";
  return isPlayable(row) ? "playable" : "failed";
};

const pairKey = (row: RenderRow): string => `${row.voiceId}/${row.storyId}`;

const groupByPair = (rows: readonly RenderRow[]): readonly (readonly RenderRow[])[] =>
  [...new Set(rows.map(pairKey))].map((key) => rows.filter((row) => pairKey(row) === key));

export const summarizePairs = (rows: readonly RenderRow[]): readonly PairSummary[] =>
  groupByPair(rows)
    .map(summarizePair)
    .filter((summary): summary is PairSummary => summary !== null)
    .toSorted(newestFirst);
