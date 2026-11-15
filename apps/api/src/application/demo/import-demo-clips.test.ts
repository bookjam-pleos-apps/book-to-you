import type { Style } from "@voice-storybook/shared/vocab";
import { describe, expect, it } from "vitest";

import type { RecordingScripts } from "../recording-scripts";
import type { ClipSummary, UploadClipInput, UploadClipResult, VoiceRecord } from "../voices";
import { importDemoClips, type DemoClipFile } from "./import-demo-clips";

const SCRIPTS: RecordingScripts = {
  clips: (["calm", "deep", "child"] as const).map((style) => ({ id: style, version: "1", style, direction: "", text: `${style} 대본` })),
  prompts: [],
  styleChecks: [],
};

const voiceWith = (clips: readonly ClipSummary[]): VoiceRecord => ({
  id: "voice-1",
  label: "엄마",
  consent: "active",
  consentRejected: false,
  isDefault: false,
  clips,
});

const fileOf = (style: Style): DemoClipFile => ({ style, audio: new Uint8Array([1]) });

// 업로드를 흉내 낸다. 올린 순서를 남기고, 정한 style은 녹음 확인에서 떨어뜨린다.
const fakeService = (initial: readonly ClipSummary[], failing: ReadonlySet<Style> = new Set()) => {
  const uploaded: UploadClipInput[] = [];
  const state = { clips: [...initial], uploaded };
  const uploadClip = async (input: UploadClipInput): Promise<UploadClipResult> => {
    state.uploaded.push(input);
    const id = `clip-${input.style}`;
    const failed = failing.has(input.style);
    state.clips.push({ id, style: input.style, status: failed ? "failed" : "passed", failure: failed ? "script_mismatch" : null, advice: null });
    return { kind: "checking", clipId: id };
  };
  const voices = { list: async () => [voiceWith(state.clips)] };
  return { state, run: importDemoClips({ voices, scripts: SCRIPTS, uploadClip }) };
};

describe("importDemoClips", () => {
  it("uploads calm first with the product script of each style and reports the verify outcome", async () => {
    const { state, run } = fakeService([], new Set(["deep"]));

    const result = await run("user-1", [fileOf("child"), fileOf("deep"), fileOf("calm")]);

    expect(state.uploaded.map(({ style, scriptId, scriptVersion, voiceId }) => [style, scriptId, scriptVersion, voiceId])).toEqual([
      ["calm", "calm", "1", "voice-1"],
      ["child", "child", "1", "voice-1"],
      ["deep", "deep", "1", "voice-1"],
    ]);
    expect(result).toEqual({
      kind: "imported",
      voiceId: "voice-1",
      clips: [
        { style: "calm", kind: "passed", clipId: "clip-calm", advice: null },
        { style: "child", kind: "passed", clipId: "clip-child", advice: null },
        { style: "deep", kind: "failed", clipId: "clip-deep", failure: "script_mismatch" },
      ],
    });
  });

  it("skips a style that already has a live clip so renders keep one reference per style", async () => {
    const { state, run } = fakeService([{ id: "old", style: "calm", status: "passed", failure: null, advice: null }]);

    const result = await run("user-1", [fileOf("calm")]);

    expect(state.uploaded).toEqual([]);
    expect(result).toMatchObject({ clips: [{ style: "calm", kind: "already_recorded" }] });
  });

  it("refuses a style without a product script and a user without exactly one voice", async () => {
    const { run } = fakeService([]);
    expect(await run("user-1", [fileOf("excited")])).toMatchObject({ clips: [{ style: "excited", kind: "no_script" }] });

    const empty = importDemoClips({ voices: { list: async () => [] }, scripts: SCRIPTS, uploadClip: async () => ({ kind: "not_found" }) });
    expect(await empty("user-1", [fileOf("calm")])).toEqual({ kind: "no_single_voice", voices: 0 });
  });

  it("uploads nothing when the same style comes twice, since two passed clips would block the render", async () => {
    const { state, run } = fakeService([]);

    const result = await run("user-1", [fileOf("deep"), fileOf("calm"), fileOf("deep")]);

    expect(result).toEqual({ kind: "duplicate_style", styles: ["deep"] });
    expect(state.uploaded).toEqual([]);
  });

  it("marks styles still checking as waiting for calm when calm did not pass", async () => {
    const clips: ClipSummary[] = [];
    const uploadClip = async (input: UploadClipInput): Promise<UploadClipResult> => {
      const failed = input.style === "calm";
      clips.push({ id: `clip-${input.style}`, style: input.style, status: failed ? "failed" : "checking", failure: failed ? "script_mismatch" : null, advice: null });
      return { kind: "checking", clipId: `clip-${input.style}` };
    };
    const run = importDemoClips({ voices: { list: async () => [voiceWith(clips)] }, scripts: SCRIPTS, uploadClip });

    const result = await run("user-1", [fileOf("deep"), fileOf("calm")]);

    expect(result).toMatchObject({
      clips: [
        { style: "calm", kind: "failed" },
        { style: "deep", kind: "waiting_for_calm" },
      ],
    });
  });
});
