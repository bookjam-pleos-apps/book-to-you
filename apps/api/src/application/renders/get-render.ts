import type { LibraryRepo, PlayableChapter } from "../library/ports";
import type { ListRenders, RenderListItem } from "./list-renders";

export type GetRenderDeps = {
  readonly listRenders: ListRenders;
  readonly library: Pick<LibraryRepo, "listRenderChapters">;
};

export type RenderDetail = RenderListItem & { readonly chapters: readonly PlayableChapter[] };

// 책장 목록(쌍마다 하나)에 있는 렌더만 연다. 남의 렌더와 앞서 대체된 렌더는 없는 것으로 본다.
// 장은 목록이 playable(동의가 살아 있는 성공 렌더)이라고 판정한 렌더에만 준다. 차의 manifest와 같은 기준이다.
export const getRender =
  ({ listRenders, library }: GetRenderDeps) =>
  async (userId: string, renderId: string): Promise<RenderDetail | null> => {
    const item = (await listRenders(userId)).find((render) => render.renderId === renderId);
    if (item === undefined) return null;
    if (item.status !== "playable") return { ...item, chapters: [] };
    return { ...item, chapters: await library.listRenderChapters(renderId) };
  };
