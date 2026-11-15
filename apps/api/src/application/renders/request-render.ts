import { statusOfRender } from "../../domain/renders/render-status";
import type { Clock } from "../ports/clock";
import type { StoryCatalog } from "../stories";
import { newRenderOf, prepareRender, type RenderPolicy, type PrepareDeps, type PrepareFailure } from "./prepare-render";
import { toListItem, type RenderListItem } from "./list-renders";
import type { RenderRepo, RenderQueueRepo } from "./ports";

export type RequestRenderDeps = Pick<PrepareDeps, "stories" | "scripts"> & {
  readonly renders: Pick<RenderRepo, "findSource">;
  readonly queue: RenderQueueRepo;
  readonly catalog: StoryCatalog;
  readonly clock: Clock;
  readonly policy: RenderPolicy;
  readonly maxPendingPerUser: number;
};

export type RequestRenderInput = {
  readonly userId: string;
  readonly voiceId: string;
  readonly storyId: string;
};

export type RequestRenderResult =
  | PrepareFailure
  | { readonly kind: "too_many_pending" }
  | { readonly kind: "queued" | "existing"; readonly render: RenderListItem };

// 남의 목소리는 없는 것으로 본다. 존재 여부를 알려 주지 않는다.
const ownedSource = (deps: RequestRenderDeps, userId: string) => async (voiceId: string) => {
  const source = await deps.renders.findSource(voiceId);
  return source?.userId === userId ? source : null;
};

// 렌더는 렌더 워커가 대기 행을 잡아 돌린다. 여기서는 검증을 통과한 요청을 대기 행으로 남기기만 한다.
export const requestRender =
  (deps: RequestRenderDeps) =>
  async ({ userId, voiceId, storyId }: RequestRenderInput): Promise<RequestRenderResult> => {
    const choice = await prepareRender({ ...deps, renders: { findSource: ownedSource(deps, userId) } }, { voiceId, storyId });
    if (choice.kind !== "ready") return choice;
    const outcome = await deps.queue.enqueue(newRenderOf(deps.policy, voiceId, choice, deps.clock()), deps.maxPendingPerUser);
    if (!("row" in outcome)) return outcome;
    const { row } = outcome;
    return { kind: outcome.kind, render: toListItem(deps.catalog, { ...row, status: statusOfRender(row) }) };
  };
