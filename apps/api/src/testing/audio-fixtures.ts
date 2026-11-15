import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ToneOptions = {
  readonly seconds: number;
  readonly amplitude?: number;
  readonly noise?: number;
  readonly extension?: "wav" | "m4a" | "webm";
};

// 말소리처럼 소리와 쉬는 구간이 번갈아 나오게 한다. 끊임없는 신호는 잡음 하한이 높게 잡힌다.
const expression = (amplitude: number, noise: number): string =>
  `${amplitude}*sin(2*PI*220*t)*lt(mod(t\\,1)\\,0.7)+${noise}*(2*random(0)-1)`;

const renderExpression = (exprs: string, seconds: number, extension: string): Uint8Array => {
  const directory = mkdtempSync(join(tmpdir(), "voice-storybook-fixture-"));
  const path = join(directory, `audio.${extension}`);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `aevalsrc=exprs='${exprs}':s=24000:d=${seconds}`, path]);
  const bytes = readFileSync(path);
  rmSync(directory, { recursive: true, force: true });
  return bytes;
};

export const toneRecording = ({ seconds, amplitude = 0.3, noise = 0, extension = "wav" }: ToneOptions): Uint8Array =>
  renderExpression(expression(amplitude, noise), seconds, extension);

export const silentRecording = (seconds: number): Uint8Array => toneRecording({ seconds, amplitude: 0 });

// 렌더러의 문단 쉼처럼 정확한 0이 한 번 이어진다. 그 밖에는 쉬지 않는다.
export const pausedRecording = (seconds: number, pause: { readonly atSeconds: number; readonly seconds: number }): Uint8Array =>
  renderExpression(`0.3*sin(2*PI*220*t)*(1-between(t\\,${pause.atSeconds}\\,${pause.atSeconds + pause.seconds}))`, seconds, "wav");
