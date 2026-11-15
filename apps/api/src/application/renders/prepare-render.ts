import type { Style } from "@voice-storybook/shared/vocab";

import { planReferences, type ReadAs } from "../../domain/renders/reference-plan";
import { chapterCountOf } from "../../domain/renders/chapter-plan";
import type { PlanFailureCode } from "../../domain/renders/render-failure";
import { renderKey } from "../../domain/renders/render-key";
import { sha256Hex } from "../../domain/sha256";
import { isRenderableLine } from "../../domain/stories/readable-text";
import type { StoryContent, StoryContents } from "../stories";
import { findClipScript, type RecordingScripts } from "../recording-scripts";
import type { RenderRepo, JobReference, NewRender, RenderClip, RenderJob, RenderSource } from "./ports";

export type RenderPolicy = {
  readonly engineId: string;
  readonly model: string;
  readonly assemblyVersion: string;
  readonly seed: number;
  readonly limits: RenderJob["limits"];
  readonly readAs: ReadAs;
};

export type PrepareDeps = {
  readonly stories: StoryContents;
  readonly scripts: RecordingScripts;
  readonly policy: RenderPolicy;
  readonly renders: Pick<RenderRepo, "findSource">;
};

export type PrepareInput = {
  readonly voiceId: string;
  readonly storyId: string;
  readonly clipIds?: readonly string[] | undefined;
  // calm만 주면 녹음이 더 있어도 모든 줄을 calm으로 읽는다. 혼합 렌더를 쓸 수 없을 때의 대체 경로다.
  readonly onlyStyles?: readonly Style[] | undefined;
};

export type PrepareFailure =
  | { readonly kind: Exclude<PlanFailureCode, "ambiguous_clip" | "unrenderable_line"> }
  | { readonly kind: "ambiguous_clip"; readonly style: Style }
  | { readonly kind: "unrenderable_line"; readonly index: number };

export type RenderChoice = {
  readonly kind: "ready";
  readonly source: RenderSource;
  readonly story: StoryContent;
  readonly clips: readonly RenderClip[];
  readonly references: readonly JobReference[];
  readonly readAs: ReadAs;
};

const referencesOf = (scripts: RecordingScripts, clips: readonly RenderClip[]): readonly JobReference[] | null => {
  const references = clips.flatMap((clip) => {
    const script = findClipScript(scripts, clip.scriptId, clip.scriptVersion);
    return script === undefined ? [] : [{ style: clip.style, text: script.text }];
  });
  return references.length === clips.length ? references : null;
};

// GPU는 허용 길이를 넘는 문장에서 렌더를 멈춘다. 렌더 행을 만들기 전에 막는다.
const firstUnrenderableLine = (story: StoryContent, maxSyllables: number): number =>
  story.lines.findIndex((line) => !isRenderableLine(line.text, maxSyllables));

const chooseReferences = (deps: PrepareDeps, input: PrepareInput, source: RenderSource, story: StoryContent): RenderChoice | PrepareFailure => {
  const rules = { policyReadAs: deps.policy.readAs, onlyStyles: input.onlyStyles && new Set(input.onlyStyles), clipIds: input.clipIds ?? [] };
  const plan = planReferences(story.lines.map((line) => line.style), source.passedClips, rules);
  if (plan.kind !== "planned") return plan;
  const references = referencesOf(deps.scripts, plan.clips);
  if (references === null) return { kind: "unknown_script" };
  return { kind: "ready", source, story, clips: plan.clips, references, readAs: plan.readAs };
};

export const prepareRender = async (deps: PrepareDeps, input: PrepareInput): Promise<RenderChoice | PrepareFailure> => {
  const story = deps.stories.findStory(input.storyId);
  if (story === null) return { kind: "unknown_story" };
  const unrenderable = firstUnrenderableLine(story, deps.policy.limits.maxSyllables);
  if (unrenderable >= 0) return { kind: "unrenderable_line", index: unrenderable };
  const source = await deps.renders.findSource(input.voiceId);
  if (source === null) return { kind: "voice_not_found" };
  if (!source.consentActive) return { kind: "no_active_consent" };
  return chooseReferences(deps, input, source, story);
};

export const newRenderOf = (policy: RenderPolicy, voiceId: string, choice: RenderChoice, startedAt: Date): NewRender => {
  const { story, clips, source } = choice;
  const { engineId, model, assemblyVersion } = policy;
  const refClipIds = clips.map((clip) => clip.id);
  const parts = { voiceId, storyId: story.id, storyVersion: story.version, refClipIds, engineId, engineVersion: model, assemblyVersion };
  return { ...parts, userId: source.userId, renderKey: renderKey(parts, sha256Hex), chaptersTotal: chapterCountOf(story.chapters), startedAt };
};
