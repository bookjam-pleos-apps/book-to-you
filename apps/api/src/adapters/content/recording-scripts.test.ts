import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { STYLES } from "@voice-storybook/shared/vocab";
import { describe, expect, it } from "vitest";

import { loadRecordingScripts, stylesWithoutScript, unusableStyleChecks } from "./recording-scripts";

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const PRODUCT_SCRIPTS = resolve(import.meta.dirname, "../../../../../content/scripts/recording-scripts.json");

const clip = (style: (typeof STYLES)[number]) => ({ id: style, version: "1", style, direction: "읽기", text: "대본" });

const DEEP_CHECK = { style: "deep" as const, anyOf: [{ metric: "pitchShiftSemitones" as const, atMost: -2 }] };

const loadFixture = (extra: object) => {
  const folder = mkdtempSync(join(tmpdir(), "recording-scripts-"));
  const path = join(folder, "recording-scripts.json");
  writeFileSync(path, JSON.stringify({ clips: STYLES.map(clip), prompts: [], ...extra }));
  return loadRecordingScripts(path);
};

describe("recording scripts", () => {
  it("names the styles that have no clip script", () => {
    expect(stylesWithoutScript({ clips: STYLES.filter((style) => style !== "child").map(clip) })).toEqual(["child"]);
    expect(stylesWithoutScript({ clips: STYLES.map(clip) })).toEqual([]);
  });

  it("refuses to load scripts that leave a style without a script", () => {
    expect(() => loadRecordingScripts(resolve(FIXTURES, "scripts", "recording-scripts-missing-child.json"))).toThrow("녹음 대본이 없는 style");
  });

  it("loads the product scripts, which cover every style", () => {
    expect(loadRecordingScripts(PRODUCT_SCRIPTS).clips.map((script) => script.style)).toEqual([...STYLES]);
  });

  // spike의 test_style_checks.py와 같은 값이다. 두 쪽이 같은 파일에서 같은 기준을 읽는다.
  it("loads the measured criteria for telling each style from calm", () => {
    expect(loadRecordingScripts(PRODUCT_SCRIPTS).styleChecks).toEqual([
      { style: "soft", anyOf: [{ metric: "speechRateChange", atMost: -0.05 }, { metric: "pitchShiftSemitones", atMost: -0.5 }] },
      { style: "deep", anyOf: [{ metric: "pitchShiftSemitones", atMost: -2.0 }] },
      { style: "child", anyOf: [{ metric: "pitchShiftSemitones", atLeast: 3.0 }] },
    ]);
  });

  it("checks nothing when the file has no criteria", () => {
    expect(loadFixture({}).styleChecks).toEqual([]);
  });

  it.each([
    ["an unknown metric", [{ style: "deep", anyOf: [{ metric: "pitchShift", atMost: -2 }] }]],
    ["a bound on neither side", [{ style: "deep", anyOf: [{ metric: "pitchShiftSemitones" }] }]],
    ["a bound on both sides", [{ style: "deep", anyOf: [{ metric: "pitchShiftSemitones", atLeast: -3, atMost: -2 }] }]],
    ["a misspelled bound", [{ style: "deep", anyOf: [{ metric: "pitchShiftSemitones", atMost: -2, atLest: 1 }] }]],
    ["no way to pass", [{ style: "deep", anyOf: [] }]],
    ["an unknown style", [{ style: "whisper", anyOf: [{ metric: "pitchShiftSemitones", atMost: -2 }] }]],
    ["calm against itself", [{ style: "calm", anyOf: [{ metric: "pitchShiftSemitones", atMost: -2 }] }]],
    ["two criteria for one style", [DEEP_CHECK, DEEP_CHECK]],
  ])("refuses %s", (_name, styleChecks) => {
    expect(() => loadFixture({ styleChecks })).toThrow();
  });

  it("names the criteria that cannot be used", () => {
    expect(unusableStyleChecks([DEEP_CHECK, { ...DEEP_CHECK, style: "calm" }, DEEP_CHECK])).toEqual(["calm", "deep"]);
  });
});
