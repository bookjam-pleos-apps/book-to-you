import type { Render, RenderStatus } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { bookTapOf, canMake, chaptersInOrder, hasMaking, MAKING_MINUTES, MAKING_NOTICE, renderOf, shelvesOf, STATUS_TEXT } from "./shelf";
import { storyListenPath } from "./library-paths";

const render = (storyId: string, voiceId: string, status: RenderStatus): Render => ({
  renderId: `${storyId}-${voiceId}`,
  storyId,
  title: storyId,
  voiceId,
  voiceLabel: voiceId === "mom" ? "엄마" : "아빠",
  status,
  shared: false,
});

const RENDERS = [render("redhood", "mom", "playable"), render("fisherman", "dad", "making"), render("fisherman", "mom", "failed")];

describe("shelvesOf", () => {
  it("목소리가 처음 나온 순서로 묶고 동화를 빠뜨리지 않는다", () => {
    const shelves = shelvesOf(RENDERS);
    expect(shelves.map((shelf) => shelf.voiceLabel)).toEqual(["엄마", "아빠"]);
    expect(shelves.flatMap((shelf) => shelf.renders)).toHaveLength(RENDERS.length);
  });

  it("동화가 없으면 책장도 없다", () => {
    expect(shelvesOf([])).toEqual([]);
  });
});

describe("renderOf", () => {
  it("고른 목소리로 만든 그 동화만 찾는다", () => {
    expect(renderOf(RENDERS, "redhood", "mom")?.status).toBe("playable");
    expect(renderOf(RENDERS, "redhood", "dad")).toBeUndefined();
    expect(renderOf(RENDERS, "fisherman", "dad")?.status).toBe("making");
  });

  it("만든 적 없거나 실패한 동화만 만들 수 있다", () => {
    const statuses: readonly (RenderStatus | null)[] = [null, "failed", "making", "playable"];
    expect(statuses.map(canMake)).toEqual([true, true, false, false]);
  });
});

describe("hasMaking", () => {
  it("만드는 중인 동화가 있을 때만 참이다", () => {
    expect(hasMaking(RENDERS)).toBe(true);
    expect(hasMaking([render("redhood", "mom", "playable")])).toBe(false);
  });
});

describe("듣기", () => {
  it("장을 번호 순서로 들려준다", () => {
    const chapter = (index: number) => ({ index, role: "body" as const, title: null, durationMs: 1000, audioUrl: `/v1/audio/a${index}` });
    const detail = { ...render("redhood", "mom", "playable"), chapters: [chapter(1), chapter(0)] };
    expect(chaptersInOrder(detail).map((item) => item.index)).toEqual([0, 1]);
  });

  it("렌더 id를 경로에 안전하게 넣는다", () => {
    expect(storyListenPath("a/b")).toBe("/library/a%2Fb");
  });
});

describe("만드는 시간 안내", () => {
  it("만드는 중 상태와 만들기 안내가 같은 분 수를 말한다", () => {
    expect(STATUS_TEXT.making).toContain(`${MAKING_MINUTES}분`);
    expect(MAKING_NOTICE).toContain(`${MAKING_MINUTES}분`);
  });
});

describe("bookTapOf", () => {
  it("만드는 중인 책을 누르면 떠나도 된다는 안내를 보인다", () => {
    expect(bookTapOf(render("fisherman", "dad", "making"))).toEqual({ kind: "notice" });
  });

  it("다 만들었거나 실패한 책은 듣기 화면으로 간다", () => {
    expect(bookTapOf(render("redhood", "mom", "playable"))).toEqual({ kind: "open", renderId: "redhood-mom" });
    expect(bookTapOf(render("fisherman", "mom", "failed"))).toEqual({ kind: "open", renderId: "fisherman-mom" });
  });
});
