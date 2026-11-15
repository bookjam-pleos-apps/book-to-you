import type { Render, VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { REQUIRED_PASSED, voiceOf } from "../features/voices/voice-fixture";
import { homePrimaryAction, homeShelvesOf, isFirstVisit, showsPairNotice } from "./home-shelves";

const named = (id: string, voice: VoiceResponse): VoiceResponse => ({ ...voice, id, label: id });

const READY = named("엄마", voiceOf("active", REQUIRED_PASSED));
const RECORDING = named("아빠", voiceOf("active", { calm: "passed" }));

const render = (storyId: string, voiceId: string): Render => ({
  renderId: `${storyId}-${voiceId}`,
  storyId,
  title: storyId,
  voiceId,
  voiceLabel: voiceId,
  status: "playable",
  shared: false,
});

describe("homeShelvesOf", () => {
  it("목소리마다 선반 하나를 목소리 순서로 두고, 동화가 없어도 선반을 둔다", () => {
    const shelves = homeShelvesOf([READY, RECORDING], [render("redhood", "엄마")]);
    expect(shelves.map((shelf) => [shelf.voiceId, shelf.renders.length, shelf.todo?.kind ?? null])).toEqual([
      ["엄마", 1, null],
      ["아빠", 0, "record"],
    ]);
  });

  it("지운 목소리로 만든 동화는 뒤에 따로 선반을 두고 할 일은 없다", () => {
    const shelves = homeShelvesOf([READY], [render("redhood", "할머니"), render("fisherman", "엄마")]);
    expect(shelves.map((shelf) => [shelf.voiceLabel, shelf.listenOnly, shelf.todo])).toEqual([
      ["엄마", false, null],
      ["할머니", true, null],
    ]);
  });

  it("대표 표시는 목소리가 둘 이상이고 대표인 선반에만 붙는다", () => {
    const mom = { ...READY, isDefault: true };
    expect(homeShelvesOf([mom], []).map((shelf) => shelf.showsDefaultBadge)).toEqual([false]);
    expect(homeShelvesOf([mom, RECORDING], []).map((shelf) => shelf.showsDefaultBadge)).toEqual([true, false]);
  });

  it("시연 서버가 함께 보여 주는 동화는 내 선반 뒤에 듣기만 하는 선반으로 둔다", () => {
    const shared = { ...render("masteraway", "예시"), shared: true };
    const shelves = homeShelvesOf([READY], [render("fisherman", "엄마"), shared]);
    expect(shelves.map((shelf) => [shelf.voiceLabel, shelf.listenOnly, shelf.todo, shelf.showsDefaultBadge])).toEqual([
      ["엄마", false, null, false],
      ["예시", true, null, false],
    ]);
  });

  it("목소리도 동화도 없으면 선반이 없다", () => {
    expect(homeShelvesOf([], [])).toEqual([]);
  });
});

describe("isFirstVisit", () => {
  it("내 목소리와 내 동화가 없으면 함께 보이는 시연 동화가 있어도 첫 방문이다", () => {
    expect(isFirstVisit([], [{ ...render("masteraway", "예시"), shared: true }])).toBe(true);
    expect(isFirstVisit([], [render("redhood", "할머니")])).toBe(false);
    expect(isFirstVisit([READY], [])).toBe(false);
  });
});

describe("homePrimaryAction", () => {
  it("만들 수 있는 목소리가 있으면 동화 만들기, 처음이면 목소리 녹음하기다", () => {
    expect(homePrimaryAction([READY, RECORDING])?.label).toBe("동화 만들기");
    expect(homePrimaryAction([])?.label).toBe("목소리 녹음하기");
  });

  it("녹음 중인 목소리뿐이면 주 버튼 없이 선반 알림이 이끈다", () => {
    expect(homePrimaryAction([RECORDING])).toBeNull();
  });
});

describe("showsPairNotice", () => {
  it("동화를 만들 수 있고 차가 없다고 확인됐을 때만 알린다", () => {
    expect(showsPairNotice([READY], 0)).toBe(true);
    expect(showsPairNotice([READY], undefined)).toBe(false);
    expect(showsPairNotice([READY], 1)).toBe(false);
    expect(showsPairNotice([RECORDING], 0)).toBe(false);
  });
});
