import type { ClipScript, PromptScript, RecordingScripts } from "./ports";

const sameVersion = (id: string, version: string) => (script: { readonly id: string; readonly version: string }): boolean =>
  script.id === id && script.version === version;

export const findClipScript = ({ clips }: RecordingScripts, id: string, version: string): ClipScript | undefined =>
  clips.find(sameVersion(id, version));

export const findPromptScript = ({ prompts }: RecordingScripts, id: string, version: string): PromptScript | undefined =>
  prompts.find(sameVersion(id, version));
