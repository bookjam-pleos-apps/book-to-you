import type { PromptKind, Style } from "@voice-storybook/shared/vocab";

import type { StyleCheck } from "../../domain/voices/style-check";

export type ClipScript = {
  readonly id: string;
  readonly version: string;
  readonly style: Style;
  readonly direction: string;
  readonly text: string;
};

export type PromptScript = {
  readonly id: string;
  readonly version: string;
  readonly kind: PromptKind;
  readonly direction: string;
  readonly text: string;
};

// styleChecks는 style 녹음이 calm과 구별되는지 보는 기준이다. 기준이 없는 style은 대본 일치만 본다.
export type RecordingScripts = {
  readonly clips: readonly ClipScript[];
  readonly prompts: readonly PromptScript[];
  readonly styleChecks: readonly StyleCheck[];
};
