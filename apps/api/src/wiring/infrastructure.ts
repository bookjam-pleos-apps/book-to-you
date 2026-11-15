import type { Context } from "hono";

import type { Database } from "../adapters/db/client";
import type { AudioTool } from "../application/ports/audio-tool";
import type { Clock } from "../application/ports/clock";
import type { JobQueue } from "../application/ports/job-queue";
import type { Mailer } from "../application/ports/mailer";
import type { ObjectStorage } from "../application/ports/object-storage";
import type { StoryCatalog, StoryContents } from "../application/stories";
import type { RecordingScripts } from "../application/recording-scripts";

export type Infrastructure = {
  readonly database: Database;
  readonly mailer: Mailer | null;
  readonly storage: ObjectStorage;
  readonly stories: StoryCatalog & StoryContents;
  readonly scripts: RecordingScripts;
  readonly audio: AudioTool;
  readonly queue: JobQueue;
  readonly clock: Clock;
  readonly remoteAddress: (c: Context) => string;
};
