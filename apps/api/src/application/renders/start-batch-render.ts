import type { Clock } from "../ports/clock";
import type { ObjectStorage } from "../ports/object-storage";
import type { StoryContents } from "../stories";
import type { RecordingScripts } from "../recording-scripts";
import { newRenderOf, prepareRender, type RenderPolicy, type PrepareFailure, type PrepareInput, type RenderChoice } from "./prepare-render";
import type { RenderRepo } from "./ports";
import { submissionOf, type RenderSubmission } from "./render-submission";

export type StartBatchDeps = {
  readonly renders: RenderRepo;
  readonly stories: StoryContents;
  readonly storage: ObjectStorage;
  readonly scripts: RecordingScripts;
  readonly clock: Clock;
  readonly policy: RenderPolicy;
};

export type StartBatchInput = PrepareInput & { readonly resume?: boolean | undefined };

export type StartBatchResult =
  | PrepareFailure
  | { readonly kind: "already_rendered" | "already_running"; readonly renderId: string }
  | ({ readonly kind: "started" } & RenderSubmission);

const beginWith = async (deps: StartBatchDeps, input: StartBatchInput, choice: RenderChoice): Promise<StartBatchResult> => {
  const render = newRenderOf(deps.policy, input.voiceId, choice, deps.clock());
  const begun = await deps.renders.begin(render, input.resume === true);
  if (begun.kind !== "started") return begun;
  return { kind: "started", ...(await submissionOf(deps, begun.renderId, choice)) };
};

export const startBatchRender =
  (deps: StartBatchDeps) =>
  async (input: StartBatchInput): Promise<StartBatchResult> => {
    const choice = await prepareRender(deps, input);
    return choice.kind === "ready" ? beginWith(deps, input, choice) : choice;
  };
