import { STYLES, type Style } from "@voice-storybook/shared/vocab";

export type ClipStatus = "checking" | "passed" | "failed";

export type StyleProgressStatus = ClipStatus | "missing";

export type StyleProgress = {
  readonly style: Style;
  readonly status: StyleProgressStatus;
};

const BEST_FIRST: readonly ClipStatus[] = ["passed", "checking", "failed"];

const statusOfStyle = (clips: readonly { readonly style: Style; readonly status: ClipStatus }[], style: Style) =>
  BEST_FIRST.find((status) => clips.some((clip) => clip.style === style && clip.status === status)) ?? "missing";

export const deriveProgress = (
  clips: readonly { readonly style: Style; readonly status: ClipStatus }[],
): readonly StyleProgress[] => STYLES.map((style) => ({ style, status: statusOfStyle(clips, style) }));
