import { describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../../lib/browser/storage";
import { MIC_GUIDE_FADE_MS, MIC_GUIDE_PLAY_MS, nextGuidePhase, showsMicGuide } from "./mic-guide";
import { readGuideSeen, rememberGuideSeen } from "./mic-guide-seen";
import { voiceOf } from "../voice-fixture";

const memoryStore = (): KeyValueStore => {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
};

describe("showsMicGuide", () => {
  it("낭독 확인을 아직 하지 않았고 이번 방문에서 처음일 때 보인다", () => {
    expect(showsMicGuide(voiceOf("none", {}), false)).toBe(true);
    expect(showsMicGuide(voiceOf("none", {}), true)).toBe(false);
    expect(showsMicGuide(voiceOf("checking", {}), false)).toBe(false);
    expect(showsMicGuide(voiceOf("active", {}), false)).toBe(false);
  });

  it("낭독 확인을 거절당했으면 이미 봤어도 다시 보인다", () => {
    expect(showsMicGuide({ ...voiceOf("none", {}), consentRejected: true }, true)).toBe(true);
  });
});

describe("nextGuidePhase", () => {
  it("재생 4.5초 → 흐려짐 0.3초 → 닫힘 순서로 간다", () => {
    expect(nextGuidePhase("playing")).toEqual({ after: MIC_GUIDE_PLAY_MS, next: "fading" });
    expect(nextGuidePhase("fading")).toEqual({ after: MIC_GUIDE_FADE_MS, next: "closed" });
    expect(nextGuidePhase("closed")).toBeNull();
  });
});

describe("guide seen", () => {
  it("목소리마다 따로 기억하고, 저장소가 없으면 안 본 것으로 본다", () => {
    const store = memoryStore();
    rememberGuideSeen(store, "v1");
    expect([readGuideSeen(store, "v1"), readGuideSeen(store, "v2"), readGuideSeen(null, "v1")]).toEqual([true, false, false]);
  });
});
