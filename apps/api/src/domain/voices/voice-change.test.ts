import { describe, expect, it } from "vitest";

import { isEmptyVoiceChange, judgeVoiceChange } from "./voice-change";

describe("judgeVoiceChange", () => {
  it("lets a voice still recording be renamed", () => {
    expect(judgeVoiceChange({ label: "아빠" }, false)).toBe("allowed");
  });

  it("refuses to make a voice without active consent the default", () => {
    expect(judgeVoiceChange({ label: "아빠", isDefault: true }, false)).toBe("no_active_consent");
  });

  it("lets a voice with active consent become the default", () => {
    expect(judgeVoiceChange({ isDefault: true }, true)).toBe("allowed");
  });

  it("lets any voice stop being the default", () => {
    expect(judgeVoiceChange({ isDefault: false }, false)).toBe("allowed");
  });
});

describe("isEmptyVoiceChange", () => {
  it.each([
    [{}, true],
    [{ label: undefined, isDefault: undefined }, true],
    [{ label: "아빠" }, false],
    [{ isDefault: false }, false],
  ])("reads %j as empty: %s", (change, empty) => {
    expect(isEmptyVoiceChange(change)).toBe(empty);
  });
});
