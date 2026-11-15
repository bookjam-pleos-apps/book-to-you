import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MIC_GUIDE_FADE_MS, MIC_GUIDE_PLAY_MS } from "../../apps/web/src/features/voices/mic-guide/mic-guide";

// 안내를 닫는 타이머(TS)와 움직임 길이(CSS)가 어긋나면 움직임이 끝나기 전에 닫히거나 멈춘 화면이 남는다.
const CSS = readFileSync(join(import.meta.dirname, "..", "..", "apps/web/src/features/voices/mic-guide/mic-guide.css"), "utf8");

const secondsOf = (name: string): number | undefined => {
  const value = new RegExp(`--${name}:\\s*([0-9.]+)s;`).exec(CSS)?.[1];
  return value === undefined ? undefined : Number(value);
};

describe("mic guide timing", () => {
  it("uses the same play and fade length in the timer and the animation", () => {
    expect(secondsOf("mic-guide-play")).toBe(MIC_GUIDE_PLAY_MS / 1000);
    expect(secondsOf("mic-guide-fade")).toBe(MIC_GUIDE_FADE_MS / 1000);
  });
});
