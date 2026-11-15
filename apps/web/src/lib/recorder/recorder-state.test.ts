import { describe, expect, it } from "vitest";

import { canPlayAudio, INITIAL_RECORDER_STATE, transition, type RecorderEvent, type RecorderState } from "./recorder-state";

const blob = new Blob(["x"], { type: "audio/webm" });

const run = (events: readonly RecorderEvent[], from: RecorderState = INITIAL_RECORDER_STATE): RecorderState =>
  events.reduce(transition, from);

const HAPPY_PATH: readonly RecorderEvent[] = [
  { type: "acquire" },
  { type: "granted" },
  { type: "started", at: 1_000 },
  { type: "captured", blob, at: 13_500, peak: 0.3, processing: "off", micCheck: { verdict: "alive", peak: 0.002, afterMs: 150 } },
  { type: "released" },
];

describe("recorder state", () => {
  it("walks idle → acquiring → ready → recording → recorded → released in order", () => {
    const kinds = HAPPY_PATH.reduce<RecorderState[]>(
      (states, event) => [...states, transition(states.at(-1) ?? INITIAL_RECORDER_STATE, event)],
      [INITIAL_RECORDER_STATE],
    ).map((state) => state.kind);
    expect(kinds).toEqual(["idle", "acquiring", "ready", "recording", "recorded", "released"]);
  });

  it("keeps the clip and its duration after the microphone is released", () => {
    const state = run(HAPPY_PATH);
    expect(state).toEqual({ kind: "released", clip: { blob, durationMs: 12_500, peak: 0.3, processing: "off", micCheck: { verdict: "alive", peak: 0.002, afterMs: 150 } } });
  });

  it("ignores events that do not fit the current state", () => {
    expect(run([{ type: "started", at: 0 }])).toEqual(INITIAL_RECORDER_STATE);
    expect(run([{ type: "captured", blob, at: 5, peak: 0, processing: "off", micCheck: null }])).toEqual(INITIAL_RECORDER_STATE);
    const recording = run(HAPPY_PATH.slice(0, 3));
    expect(transition(recording, { type: "acquire" })).toBe(recording);
  });

  it("can record again only after the microphone is closed", () => {
    expect(run([...HAPPY_PATH, { type: "acquire" }]).kind).toBe("acquiring");
    expect(transition(run(HAPPY_PATH.slice(0, 4)), { type: "acquire" }).kind).toBe("recorded");
  });

  it("goes back to idle when the microphone closes before anything was captured", () => {
    expect(run([...HAPPY_PATH.slice(0, 3), { type: "released" }])).toEqual(INITIAL_RECORDER_STATE);
  });

  it("lets a denied user retry the permission prompt", () => {
    expect(run([{ type: "acquire" }, { type: "denied" }, { type: "acquire" }]).kind).toBe("acquiring");
  });

  it("allows playback only while the microphone is closed (WebKit 326286)", () => {
    const states = HAPPY_PATH.reduce<RecorderState[]>(
      (acc, event) => [...acc, transition(acc.at(-1) ?? INITIAL_RECORDER_STATE, event)],
      [INITIAL_RECORDER_STATE],
    );
    expect(states.map(canPlayAudio)).toEqual([true, false, false, false, false, true]);
  });
});
