import { createChapterizeRepo } from "../adapters/db/repos/chapterize-repo";
import type { Database } from "../adapters/db/client";
import type { AudioCutter } from "../application/ports/audio-cutter";
import type { ObjectStorage } from "../application/ports/object-storage";
import type { SilenceFinder } from "../application/ports/silence-finder";
import { chapterizePublished } from "../application/chapterize";
import type { StoryContents } from "../application/stories";

export type ChapterizeInfrastructure = {
  readonly database: Database;
  readonly storage: ObjectStorage;
  readonly stories: StoryContents;
  readonly silences: SilenceFinder;
  readonly cutter: AudioCutter;
};

export const wireChapterize = ({ database, ...rest }: ChapterizeInfrastructure) =>
  chapterizePublished({ renders: createChapterizeRepo(database), ...rest });
