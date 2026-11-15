import { describe, expect, it } from "vitest";

import { isOnlyMode, nextPath, recordStepPath } from "./voice-paths";

describe("nextPath", () => {
  it("등록 흐름은 다음 단계로 간다", () => {
    expect(nextPath("v1", "consent", false)).toBe("/voices/v1/record/calm");
  });

  it("마지막 단계 뒤에는 완료 화면으로 간다", () => {
    expect(nextPath("v1", "belt", false)).toBe("/voices/v1/done");
  });

  it("하나만 다시 녹음하면 상세로 돌아간다", () => {
    expect(nextPath("v1", "calm", true)).toBe("/voices/v1");
  });
});

describe("recordStepPath", () => {
  it("only 표시는 다시 읽을 수 있다", () => {
    const search = new URL(recordStepPath("v1", "soft", true), "http://x").search;
    expect(isOnlyMode(search)).toBe(true);
    expect(isOnlyMode("")).toBe(false);
  });
});
