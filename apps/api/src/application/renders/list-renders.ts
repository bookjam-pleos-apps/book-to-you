import { summarizePairs, type PairStatus } from "../../domain/renders/render-status";
import { storyTitle, type StoryCatalog } from "../stories";
import type { RenderListRepo } from "./ports";

export type ListRendersDeps = {
  readonly renders: RenderListRepo;
  readonly catalog: StoryCatalog;
};

export type RenderListItem = {
  readonly renderId: string;
  readonly storyId: string;
  readonly title: string;
  readonly voiceId: string;
  readonly voiceLabel: string;
  readonly status: PairStatus;
  readonly shared: boolean;
};

export type ListRenders = (userId: string) => Promise<readonly RenderListItem[]>;

// 내 렌더 한 줄이다. 시연 계정의 것을 함께 싣는 표시(shared)는 withSharedRenders만 켠다.
export const toListItem = (catalog: StoryCatalog, { renderId, storyId, voiceId, voiceLabel, status }: Omit<RenderListItem, "title" | "shared">): RenderListItem => ({
  renderId,
  storyId,
  title: storyTitle(catalog, storyId),
  voiceId,
  voiceLabel,
  status,
  shared: false,
});

export const listRenders =
  ({ renders, catalog }: ListRendersDeps) =>
  async (userId: string): Promise<readonly RenderListItem[]> =>
    summarizePairs(await renders.listRenderRows(userId)).map((pair) => toListItem(catalog, pair));
