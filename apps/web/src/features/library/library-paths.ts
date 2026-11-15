export const STORIES_PATH = "/stories";

export const SHELF_PATH = "/library";

export const storyMakePath = (storyId: string): string => `/stories/${encodeURIComponent(storyId)}`;

export const storyListenPath = (renderId: string): string => `${SHELF_PATH}/${encodeURIComponent(renderId)}`;
