import { compareText } from "../compare-text";

// 렌더 행을 시작 시각으로 줄 세운다. 시각이 같거나 없으면 id로 정해, 호출마다 다른 행이 앞에 오지 않게 한다.
type Timed = { readonly renderId: string; readonly startedAt: Date | null };

const startedMs = (row: Timed): number => row.startedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

export const oldestFirst = (left: Timed, right: Timed): number =>
  startedMs(left) - startedMs(right) || compareText(left.renderId, right.renderId);

export const newestFirst = (left: Timed, right: Timed): number => oldestFirst(right, left);
