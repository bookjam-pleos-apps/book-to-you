import { createLibraryRepo } from "../adapters/db/repos/library-repo";
import { createRenderListRepo } from "../adapters/db/repos/render-list-repo";
import { createRenderQueueRepo } from "../adapters/db/repos/render-queue-repo";
import { createRenderRepo } from "../adapters/db/repos/render-repo";
import { renderRoutes } from "../adapters/http/routes/render-routes";
import { getRender, type ListRenders, listRenders, requestRender, withSharedRenders } from "../application/renders";
import { listStories } from "../application/stories";
import { POLICY } from "../config";
import type { Infrastructure } from "./infrastructure";
import { sharedShelfOwnerOf, type SharedShelfEnv } from "./shared-shelf-owner";

// 부모 웹의 "만들기"와 운영자의 데모 렌더 요청이 같은 대기열 규칙(상한, 같은 요청 재사용)을 쓴다.
export const wireRequestRender = ({ database, stories, scripts, clock }: Pick<Infrastructure, "database" | "stories" | "scripts" | "clock">) =>
  requestRender({
    renders: createRenderRepo(database),
    queue: createRenderQueueRepo(database),
    catalog: stories,
    stories,
    scripts,
    clock,
    policy: POLICY.batchRender,
    maxPendingPerUser: POLICY.renderRequest.maxPendingPerUser,
  });

const shelfRendersOf = (list: ListRenders, env: SharedShelfEnv): ListRenders => {
  const owner = sharedShelfOwnerOf(env);
  return owner === null ? list : withSharedRenders(list, owner);
};

export const wireRenderRoutes = (env: SharedShelfEnv, infrastructure: Infrastructure) => {
  const { database, stories } = infrastructure;
  const shelfRenders = shelfRendersOf(listRenders({ renders: createRenderListRepo(database), catalog: stories }), env);
  return renderRoutes({
    listStories: listStories(stories),
    listRenders: shelfRenders,
    getRender: getRender({ listRenders: shelfRenders, library: createLibraryRepo(database) }),
    requestRender: wireRequestRender(infrastructure),
  });
};
