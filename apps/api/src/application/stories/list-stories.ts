import type { StoryCatalog } from "./ports";
import { storyTitle } from "./story-title";

export type ListedStory = { readonly id: string; readonly title: string };

export const listStories =
  (catalog: StoryCatalog) =>
  (): readonly ListedStory[] =>
    catalog.list().map(({ id }) => ({ id, title: storyTitle(catalog, id) }));
