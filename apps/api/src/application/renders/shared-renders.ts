import type { ListRenders, RenderListItem } from "./list-renders";
import { appendSharedOwner } from "../../domain/shared-owner";

const publishedAsShared = (renders: readonly RenderListItem[]): readonly RenderListItem[] =>
  renders.filter((render) => render.status === "playable").map((render) => ({ ...render, shared: true }));

// 시연 서버 전용. 부모 웹 책장에 데모 계정의 게시된(playable) 동화만 shared로 붙인다. 차 manifest의 withSharedShelf와 같은 범위다.
export const withSharedRenders =
  (listRenders: ListRenders, sharedOwnerId: string): ListRenders =>
  (userId) =>
    appendSharedOwner(userId, sharedOwnerId, listRenders, publishedAsShared);
