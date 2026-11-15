import { STYLES } from "@voice-storybook/shared/vocab";
import { describe, expect, it } from "vitest";

import { voiceOf } from "../voice-fixture";
import { canBeDefault, consentRowOf, voiceRows } from "./voice-rows";

describe("voiceRows", () => {
  it("스타일마다 한 줄씩 정해진 순서로 내고, 하지 않은 선택 녹음은 뺀다", () => {
    expect(voiceRows(voiceOf("active", { soft: "passed" })).map((row) => row.style)).toEqual([...STYLES]);
    expect(voiceRows(voiceOf("active", {})).map((row) => row.style)).toEqual(STYLES.filter((style) => style !== "soft"));
  });

  it("낭독 확인 전에는 감정 녹음 줄을 보이지 않는다", () => {
    expect(voiceRows(voiceOf("checking", { calm: "failed" }))).toEqual([]);
    expect(voiceRows(voiceOf("none", {}))).toEqual([]);
  });

  it("통과는 ✓로만, 다시 녹음은 빨간 글로, 확인 중과 남은 녹음은 흐린 글로 보인다", () => {
    const rows = voiceRows(voiceOf("active", { calm: "passed", excited: "checking", soft: "failed" }));
    const byStyle = Object.fromEntries(rows.map((row) => [row.style, [row.passed, row.status, row.tone]]));
    expect(byStyle).toEqual({
      calm: [true, null, "muted"],
      excited: [false, "확인 중", "muted"],
      soft: [false, "다시 녹음해 주세요", "danger"],
      deep: [false, "남았어요", "muted"],
      child: [false, "남았어요", "muted"],
    });
  });

  it("대표 목소리는 목소리가 둘 이상이고 낭독 확인이 끝났을 때만 고른다", () => {
    expect(canBeDefault(voiceOf("active", {}), 2)).toBe(true);
    expect(canBeDefault(voiceOf("active", {}), 1)).toBe(false);
    expect(canBeDefault(voiceOf("none", {}), 2)).toBe(false);
  });

  it("목소리 목록을 아직 받지 못했으면 대표를 보이지 않는다", () => {
    expect(canBeDefault(voiceOf("active", {}), undefined)).toBe(false);
  });
});

describe("consentRowOf", () => {
  it("확인된 낭독은 ✓만, 확인 중·남음은 흐린 글로, 탈락은 빨간 글로 보인다", () => {
    expect(consentRowOf(voiceOf("active", {}))).toMatchObject({ passed: true, status: null });
    expect(consentRowOf(voiceOf("checking", {}))).toMatchObject({ passed: false, status: "확인 중", tone: "muted" });
    expect(consentRowOf(voiceOf("none", {}))).toMatchObject({ passed: false, status: "남았어요", tone: "muted" });
    expect(consentRowOf({ ...voiceOf("none", {}), consentRejected: true })).toMatchObject({ status: "다시 읽어 주세요", tone: "danger" });
  });
});
