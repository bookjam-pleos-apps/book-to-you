import { parseArgs } from "node:util";

import { isStyle, type Style } from "@voice-storybook/shared/vocab";

import type { StartBatchInput } from "../../application/renders";

export type BatchCommand =
  | { readonly kind: "start"; readonly input: StartBatchInput; readonly jobDirectory: string }
  | { readonly kind: "publish"; readonly jobDirectory: string }
  | { readonly kind: "queued" }
  | { readonly kind: "abandon"; readonly renderId: string };

const OPTIONS = {
  voice: { type: "string" },
  story: { type: "string" },
  clip: { type: "string", multiple: true },
  styles: { type: "string" },
  resume: { type: "boolean" },
  "job-dir": { type: "string" },
  render: { type: "string" },
} as const;

const required = (name: string, value: string | undefined): string => {
  if (value === undefined) throw new Error(`--${name}가 필요하다`);
  return value;
};

// --styles calm처럼 쉼표로 받는다. 오타를 모르는 style로 넘기지 않고 바로 멈춘다.
const parseStyles = (value: string | undefined): readonly Style[] | undefined => {
  if (value === undefined) return undefined;
  const styles = value.split(",").map((style) => style.trim());
  const unknown = styles.filter((style) => !isStyle(style));
  if (unknown.length > 0) throw new Error(`알 수 없는 style이다: ${unknown.join(", ")}`);
  return styles.filter(isStyle);
};

export const parseBatchCommand = (args: readonly string[]): BatchCommand => {
  const { positionals, values } = parseArgs({ args: [...args], allowPositionals: true, options: OPTIONS });
  const [command] = positionals;
  if (command === "queued") return { kind: "queued" };
  if (command === "abandon") return { kind: "abandon", renderId: required("render", values.render) };
  const jobDirectory = required("job-dir", values["job-dir"]);
  if (command === "publish") return { kind: "publish", jobDirectory };
  if (command !== "start") throw new Error(`알 수 없는 명령이다: ${String(command)}. start, publish, queued, abandon 중 하나를 쓴다`);
  const target = { voiceId: required("voice", values.voice), storyId: required("story", values.story) };
  const input = { ...target, clipIds: values.clip, onlyStyles: parseStyles(values.styles), resume: values.resume };
  return { kind: "start", input, jobDirectory };
};
