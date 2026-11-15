import type { Style } from "@voice-storybook/shared/vocab";

export type StoryLine = {
  readonly text: string;
  readonly style: Style;
  readonly pauseAfterMs: number;
};

// 소리를 바꾸는 값만 넣는다. 제목이나 인물 주석을 고쳐도 다시 렌더하지 않아야 한다.
export const storyVersion = (lines: readonly StoryLine[], hash: (input: string) => string): string =>
  hash(JSON.stringify(lines.map(({ text, style, pauseAfterMs }) => [text, style, pauseAfterMs])));
