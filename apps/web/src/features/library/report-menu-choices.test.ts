import type { Render } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { reportItemsOf } from "./report-menu-choices";

const MINE: Render = { renderId: "r1", storyId: "redhood", title: "빨간 모자", voiceId: "v1", voiceLabel: "엄마", status: "playable", shared: false };
const EXAMPLE: Render = { ...MINE, voiceLabel: "예시", shared: true };

describe("reportItemsOf", () => {
  it("예시 동화는 차와 같은 문구로 목소리와 내용을 신고한다", () => {
    expect(reportItemsOf(EXAMPLE)).toEqual([
      { reason: "voice", label: "목소리가 이상해요", feedback: false },
      { reason: "content", label: "내용이 부적절해요", feedback: false },
    ]);
  });

  it("내 동화의 목소리는 신고가 아니라 내 목소리 같지 않다고 알리는 것이다", () => {
    expect(reportItemsOf(MINE)).toEqual([
      { reason: "voice", label: "내 목소리 같지 않아요", feedback: true },
      { reason: "content", label: "내용이 부적절해요", feedback: false },
    ]);
  });

  it("아직 들을 수 없는 동화는 알릴 것이 없다", () => {
    expect(reportItemsOf({ ...MINE, status: "making" })).toEqual([]);
    expect(reportItemsOf({ ...MINE, status: "failed" })).toEqual([]);
  });
});
