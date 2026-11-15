import { createLibraryRepo } from "../adapters/db/repos/library-repo";
import { libraryRoutes } from "../adapters/http/routes/library-routes";
import { getLibrary, type LibraryRepo, openAudio, withSharedShelf } from "../application/library";
import { POLICY } from "../config";
import type { Infrastructure } from "./infrastructure";
import { sharedShelfOwnerOf, type SharedShelfEnv } from "./shared-shelf-owner";

export const shelfLibraryOf = (library: LibraryRepo, env: SharedShelfEnv): LibraryRepo => {
  const owner = sharedShelfOwnerOf(env);
  return owner === null ? library : withSharedShelf(library, owner);
};

export const wireLibraryRoutes = (env: SharedShelfEnv, { database, storage, stories }: Infrastructure) => {
  const library = shelfLibraryOf(createLibraryRepo(database), env);
  return libraryRoutes({
    getLibrary: getLibrary({ library, catalog: stories }),
    openAudio: openAudio({ library, storage }),
    maxOfflineSeconds: POLICY.maxOfflineSeconds,
  });
};
