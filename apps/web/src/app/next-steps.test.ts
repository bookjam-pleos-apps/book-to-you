import type { Render } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { REQUIRED_PASSED, voiceOf } from "../features/voices/voice-fixture";
import { afterPairing, afterRecording } from "./next-steps";

const READY = voiceOf("active", REQUIRED_PASSED);
const RECORDING = voiceOf("active", { calm: "passed" });
const RENDER: Render = { renderId: "r1", storyId: "redhood", title: "빨간 모자", voiceId: "v1", voiceLabel: "엄마", status: "making", shared: false };

describe("afterPairing", () => {
  it("목소리가 없으면 목소리부터 녹음하게 한다", () => {
    expect(afterPairing([], []).action).toEqual({ label: "목소리 추가하기", path: "/voices/new" });
  });

  it("녹음 중인 목소리가 있으면 마저 녹음하게 한다", () => {
    expect(afterPairing([RECORDING], []).action.path).toBe("/voices/v1/record/excited");
  });

  it("준비된 목소리만 있고 동화가 없으면 동화를 만들게 한다", () => {
    expect(afterPairing([READY], []).action).toEqual({ label: "동화 만들기", path: "/stories" });
  });

  it("시연 서버가 함께 보여 주는 동화만 있으면 내 동화가 없는 것으로 보고 동화를 만들게 한다", () => {
    expect(afterPairing([READY], [{ ...RENDER, shared: true }]).action.path).toBe("/stories");
  });

  it("동화가 있으면 홈으로 보낸다", () => {
    expect(afterPairing([READY], [RENDER]).action.path).toBe("/home");
  });
});

describe("afterRecording", () => {
  it("작은 목소리까지 녹음했으면 동화 만들기 하나만 권한다", () => {
    expect(afterRecording(voiceOf("active", { ...REQUIRED_PASSED, soft: "passed" }))).toEqual({
      body: "이제 엄마 목소리로 동화를 만들 수 있어요.",
      action: { label: "동화 만들기", path: "/stories" },
    });
  });

  it("작은 목소리를 아직 녹음하지 않았으면 동화 만들기 아래에 권한다", () => {
    const next = afterRecording(READY);
    expect(next.action).toEqual({ label: "동화 만들기", path: "/stories" });
    expect(next.extra).toEqual({ label: "속삭이는 장면도 내 목소리로 (1분)", path: "/voices/v1/record/soft" });
  });

  it("준비되지 않았으면 작은 목소리를 권하지 않는다", () => {
    expect(afterRecording(voiceOf("active", { ...REQUIRED_PASSED, calm: "checking" })).extra).toBeUndefined();
    expect(afterRecording(voiceOf("active", { ...REQUIRED_PASSED, excited: "failed" })).extra).toBeUndefined();
  });

  it("확인 중이면 기다리라고 하고 홈으로 보낸다. 낭독 확인 중이면 녹음이 남았다고 한다", () => {
    expect(afterRecording(voiceOf("active", { ...REQUIRED_PASSED, calm: "checking" }))).toEqual({
      body: "목소리를 확인하고 있어요. 끝나면 동화를 만들 수 있어요.",
      action: { label: "홈으로", path: "/home" },
    });
    expect(afterRecording(voiceOf("checking", {})).body).toBe("낭독을 확인하고 있어요. 끝나면 이어서 녹음할 수 있어요.");
  });

  it("남은 녹음이 있으면 개수를 알리고 이어서 녹음하기로 보낸다", () => {
    expect(afterRecording(voiceOf("active", { ...REQUIRED_PASSED, excited: "failed" }))).toEqual({
      body: "녹음이 1개 남았어요.",
      action: { label: "이어서 녹음하기", path: "/voices/v1/record/excited" },
    });
  });
});
