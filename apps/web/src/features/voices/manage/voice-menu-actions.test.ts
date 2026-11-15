import { describe, expect, it } from "vitest";

import { voiceOf } from "../voice-fixture";
import { voiceMenuActions } from "./voice-menu-actions";

const NOOP = { rename: () => undefined, toggleDefault: () => undefined, askDelete: () => undefined };

const labelsOf = (isDefault: boolean, canBeDefault: boolean) =>
  voiceMenuActions({ ...voiceOf("active", {}), isDefault }, canBeDefault, NOOP).map((action) => [action.label, action.tone ?? "default"]);

describe("voiceMenuActions", () => {
  it("대표를 고를 수 있으면 대표 항목을 넣고, 지우기는 맨 아래 빨간 글자다", () => {
    expect(labelsOf(false, true)).toEqual([
      ["이름 바꾸기", "default"],
      ["대표 목소리로 정하기", "default"],
      ["목소리 지우기", "danger"],
    ]);
  });

  it("이미 대표면 빼기로 보인다", () => {
    expect(labelsOf(true, true)[1]).toEqual(["대표 목소리에서 빼기", "default"]);
  });

  it("대표를 고를 수 없으면(목소리 하나, 낭독 확인 전) 대표 항목이 없다", () => {
    expect(labelsOf(false, false).map(([label]) => label)).toEqual(["이름 바꾸기", "목소리 지우기"]);
  });
});
