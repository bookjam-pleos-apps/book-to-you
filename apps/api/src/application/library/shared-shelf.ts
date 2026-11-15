import type { LibraryRepo } from "./ports";
import { appendSharedOwner } from "../../domain/shared-owner";

// 시연 서버 전용. 다른 계정의 책장에 시연 계정의 게시된 렌더를 함께 싣고, 그 렌더의 장 오디오만 열어 준다.
// 시연 계정의 안내 녹음과 대표 목소리는 넘기지 않는다. 내 것이 먼저이고, 시연 계정 자신에게는 덧붙이지 않는다.
export const withSharedShelf = (library: LibraryRepo, sharedOwnerId: string): LibraryRepo => ({
  ...library,
  listPlayableRenders: (userId) => appendSharedOwner(userId, sharedOwnerId, (ownerId) => library.listPlayableRenders(ownerId), (shared) => shared),
  findShelfRender: async (renderId, userId) => {
    const own = await library.findShelfRender(renderId, userId);
    if (own !== null || userId === sharedOwnerId) return own;
    return library.findShelfRender(renderId, sharedOwnerId);
  },
  findPlayableAudio: async (audioId, userId) => {
    const own = await library.findPlayableAudio(audioId, userId);
    if (own !== null || userId === sharedOwnerId) return own;
    return library.findPlayableChapter(audioId, sharedOwnerId);
  },
});
