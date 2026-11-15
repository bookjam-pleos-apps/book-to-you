import { describe, expect, it } from "vitest";

import { coverOf, javaHashCode, pickArt, toneOf } from "./cover";

describe("cover", () => {
  it("Java String.hashCode와 같은 값을 낸다", () => {
    expect(javaHashCode("")).toBe(0);
    expect(javaHashCode("hello")).toBe(99162322);
    expect(javaHashCode("polygenelubricants")).toBe(-2147483648);
  });

  // 차량 앱 CoverTest.kt의 "color blocks match the web rule"과 같은 id·같은 기대값이다.
  it("시연 동화는 차량 앱과 같은 색, 나머지는 해시로 늘 같은 색이다", () => {
    expect([toneOf("redhood"), toneOf("fisherman"), toneOf("masteraway")]).toEqual(["red", "sea", "mint"]);
    expect(["hello", "polygenelubricants", "c", "b"].map(toneOf)).toEqual(["sea", "sea", "red", "mint"]);
  });

  it("원하는 비율이 없으면 다른 비율을 그대로 쓰고, 둘 다 없으면 그림이 없다", () => {
    expect(pickArt({ portrait: "p.webp", landscape: "l.webp" }, "portrait")).toEqual({ src: "p.webp", shape: "portrait" });
    expect(pickArt({ landscape: "l.webp" }, "portrait")).toEqual({ src: "l.webp", shape: "landscape" });
    expect(pickArt(undefined, "landscape")).toBeNull();
  });

  it("표에 없는 이야기는 색 블록이다", () => {
    expect(coverOf({}, "new-story", "landscape")).toEqual({ tone: toneOf("new-story"), art: null });
  });
});
