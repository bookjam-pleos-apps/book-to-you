import { orderShelf } from "../../domain/library/shelf-order";
import { storyTitle, type StoryCatalog } from "../stories";
import type { LibraryRepo, PlayablePrompt, PlayableRender } from "./ports";

export type GetLibraryDeps = {
  readonly library: LibraryRepo;
  readonly catalog: StoryCatalog;
};

export type LibraryStory = PlayableRender & { readonly title: string };

export type Library = {
  readonly defaultVoiceId: string | null;
  readonly stories: readonly LibraryStory[];
  readonly prompts: readonly PlayablePrompt[];
};

export const getLibrary =
  ({ library, catalog }: GetLibraryDeps) =>
  async (userId: string): Promise<Library> => {
    const [renders, prompts, defaultVoiceId] = await Promise.all([
      library.listPlayableRenders(userId),
      library.listPlayablePrompts(userId),
      library.findDefaultVoiceId(userId),
    ]);
    const stories = renders.map((render) => ({ ...render, title: storyTitle(catalog, render.storyId) }));
    return { defaultVoiceId, stories: orderShelf(stories, defaultVoiceId), prompts };
  };
