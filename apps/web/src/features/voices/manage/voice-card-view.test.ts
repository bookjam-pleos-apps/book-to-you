import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { nextVoiceAction, voiceTodo } from "./voice-card-view";
import { REQUIRED_PASSED, voiceOf } from "../voice-fixture";

describe("voiceTodo", () => {
  it("준비된 목소리는 할 일이 없다(선택 녹음도 홈에서 권하지 않는다)", () => {
    expect(voiceTodo(voiceOf("active", REQUIRED_PASSED))).toBeNull();
  });

  it("남은 녹음은 개수와 이어서 녹음할 곳을 알린다", () => {
    expect(voiceTodo(voiceOf("active", { calm: "passed", excited: "failed" }))).toEqual({
      kind: "record",
      remaining: 3,
      path: "/voices/v1/record/excited",
    });
  });

  it("낭독 확인을 아직 안 했으면 낭독 확인도 하나로 센다", () => {
    expect(voiceTodo(voiceOf("none", {}))).toEqual({ kind: "record", remaining: 5, path: "/voices/v1/record/consent" });
  });

  it("필수를 마치고 선택 녹음만 실패했으면 그 하나를 센다(0개로 보이지 않는다)", () => {
    expect(voiceTodo(voiceOf("active", { ...REQUIRED_PASSED, soft: "failed" }))).toEqual({
      kind: "record",
      remaining: 1,
      path: "/voices/v1/record/soft",
    });
  });

  it("낭독 확인 중이면 지금은 기다리고, 끝나면 녹음이 남았다고 알린다", () => {
    expect(voiceTodo(voiceOf("checking", {}))).toEqual({ kind: "checking", next: "record" });
  });

  it("클립 확인만 남은 목소리는 끝나면 동화를 만들 수 있고, 벨트 안내로 보내지 않는다", () => {
    expect(voiceTodo(voiceOf("active", { ...REQUIRED_PASSED, calm: "checking" }))).toEqual({ kind: "checking", next: "make" });
  });
});

describe("nextVoiceAction", () => {
  const named = (id: string, voice: VoiceResponse): VoiceResponse => ({ ...voice, id, label: id });

  it("녹음이 남은 첫 목소리를 마저 녹음하게 한다", () => {
    const voices = [named("할머니", voiceOf("checking", {})), named("아빠", voiceOf("active", { calm: "passed" }))];
    expect(nextVoiceAction(voices)).toEqual({ label: "아빠 목소리 이어서 녹음하기", path: "/voices/아빠/record/excited" });
  });

  it("목소리가 없으면 새로 추가하게 한다", () => {
    expect(nextVoiceAction([])).toEqual({ label: "목소리 추가하기", path: "/voices/new" });
  });

  it("확인만 기다리는 목소리뿐이면 할 일이 없다", () => {
    expect(nextVoiceAction([voiceOf("active", { ...REQUIRED_PASSED, calm: "checking" })])).toBeNull();
  });
});
