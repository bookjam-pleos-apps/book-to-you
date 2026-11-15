import type { Style } from "@voice-storybook/shared/vocab";

export const resolveReferenceStyle = (
  wanted: Style,
  available: ReadonlySet<Style>,
): Style | null => {
  if (available.has(wanted)) return wanted;
  if (available.has("calm")) return "calm";
  return null;
};
