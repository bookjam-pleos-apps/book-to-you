import type { Style } from "@voice-storybook/shared/vocab";

import { baseSeedOf } from "../../domain/renders/retry-seed";
import { readObjectBytes, type ObjectStorage } from "../ports/object-storage";
import type { RenderPolicy, RenderChoice } from "./prepare-render";
import type { RenderRepo, RenderClip, RenderJob } from "./ports";

// 렌더 장비에 넘기는 한 벌이다. 운영자 배치와 렌더 워커가 같은 것을 만든다.
export type RenderSubmission = {
  readonly job: RenderJob;
  readonly referenceWavs: ReadonlyMap<Style, Uint8Array>;
};

export type SubmissionDeps = {
  readonly renders: Pick<RenderRepo, "priorFailures">;
  readonly storage: ObjectStorage;
  readonly policy: RenderPolicy;
};

const renderJobOf = (policy: RenderPolicy, seed: number, renderId: string, { story, references, readAs }: RenderChoice): RenderJob => ({
  renderId,
  storyId: story.id,
  model: policy.model,
  seed,
  limits: policy.limits,
  references,
  readAs,
  lines: story.lines,
});

const readReferenceWavs = async (storage: ObjectStorage, clips: readonly RenderClip[]): Promise<ReadonlyMap<Style, Uint8Array>> =>
  new Map(await Promise.all(clips.map(async (clip) => [clip.style, await readObjectBytes(storage, clip.storageKey)] as const)));

export const submissionOf = async ({ renders, storage, policy }: SubmissionDeps, renderId: string, choice: RenderChoice): Promise<RenderSubmission> => {
  const seed = baseSeedOf(policy.seed, await renders.priorFailures(renderId));
  return { job: renderJobOf(policy, seed, renderId, choice), referenceWavs: await readReferenceWavs(storage, choice.clips) };
};
