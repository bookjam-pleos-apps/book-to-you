import type { StoryCatalog } from "./ports";

// manifest에서 빠지면 차량이 그 이야기의 캐시를 지운다. 제목을 못 찾아도 항목은 남긴다.
export const storyTitle = (catalog: StoryCatalog, storyId: string): string => catalog.findTitle(storyId) ?? storyId;
