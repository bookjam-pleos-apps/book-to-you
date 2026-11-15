import { readFileSync } from "node:fs";

import { PROMPT_KINDS, STYLES, type Style } from "@voice-storybook/shared/vocab";
import { z } from "zod";

import type { RecordingScripts } from "../../application/recording-scripts/ports";
import { ANCHOR_STYLE, STYLE_METRICS, type StyleCheck } from "../../domain/voices/style-check";

const scriptFields = {
  id: z.string().min(1),
  version: z.string().min(1),
  direction: z.string().min(1),
  text: z.string().min(1),
};

// 경계는 한쪽만 둔다. 모르는 필드를 거부해야 오타 난 경계가 조용히 빠지지 않는다.
const metric = z.enum(STYLE_METRICS);
const boundSchema = z.union([
  z.strictObject({ metric, atLeast: z.number() }),
  z.strictObject({ metric, atMost: z.number() }),
]);

// 조건이 없으면 아무 녹음도 통과하지 못한다.
const styleCheckSchema = z.strictObject({ style: z.enum(STYLES), anyOf: z.array(boundSchema).min(1) });

const documentSchema = z.object({
  clips: z.array(z.object({ ...scriptFields, style: z.enum(STYLES) })),
  prompts: z.array(z.object({ ...scriptFields, kind: z.enum(PROMPT_KINDS) })),
  styleChecks: z.array(styleCheckSchema).default([]),
});

// 대본이 없는 style은 웹 등록이 그 단계에서 멈추고 목소리가 준비되지 않는다. 서버가 뜰 때 막는다.
export const stylesWithoutScript = ({ clips }: Pick<RecordingScripts, "clips">): readonly Style[] =>
  STYLES.filter((style) => !clips.some((clip) => clip.style === style));

// 기준점인 calm은 자기 자신과 비교할 수 없고, 한 style에 기준이 둘이면 어느 쪽을 쓸지 정할 수 없다.
export const unusableStyleChecks = (checks: readonly StyleCheck[]): readonly Style[] =>
  checks
    .filter(({ style }, index) => style === ANCHOR_STYLE || checks.findIndex((other) => other.style === style) !== index)
    .map(({ style }) => style);

export const loadRecordingScripts = (path: string): RecordingScripts => {
  const scripts = documentSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const missing = stylesWithoutScript(scripts);
  if (missing.length > 0) throw new Error(`녹음 대본이 없는 style: ${missing.join(", ")} (${path})`);
  const unusable = unusableStyleChecks(scripts.styleChecks);
  if (unusable.length > 0) throw new Error(`쓸 수 없는 style 구별 기준: ${unusable.join(", ")} (${path})`);
  return scripts;
};
