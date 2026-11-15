import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { STYLES, type Style } from "@voice-storybook/shared/vocab";
import { describe, expect, it } from "vitest";

import { isVoiceReady, isVoiceStep, optionalStyleToOffer, resumePoint, stepAfter, stepNumber, stepProgress, VOICE_STEPS } from "./voice-steps";

type Progress = VoiceResponse["progress"][number]["status"];
type Statuses = Partial<Readonly<Record<Style, Progress>>>;

const voice = (consent: VoiceResponse["consent"], statuses: Statuses = {}): VoiceResponse => ({
  id: "v1",
  label: "엄마",
  consent,
  consentRejected: false,
  isDefault: false,
  clips: [],
  progress: STYLES.map((style) => ({ style, status: statuses[style] ?? "passed" })),
});

describe("voice registration steps", () => {
  it("walks the required recordings only, shown as '6단계 중 N'", () => {
    expect(VOICE_STEPS).toEqual(["consent", "calm", "excited", "deep", "child", "belt"]);
    expect(VOICE_STEPS.map(stepNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(VOICE_STEPS.map(stepAfter)).toEqual(["calm", "excited", "deep", "child", "belt", "done"]);
  });

  it("opens the optional soft step outside the count and ends there", () => {
    expect(isVoiceStep("soft")).toBe(true);
    expect(stepProgress("soft")).toBeUndefined();
    expect(stepProgress("deep")).toEqual({ current: 4, total: 6 });
    expect(stepAfter("soft")).toBe("done");
  });

  it("starts with the consent reading, and waits while it is being checked", () => {
    expect(resumePoint(voice("none"))).toBe("consent");
    expect(resumePoint(voice("checking"))).toBe("consent_checking");
  });

  it("resumes at the first required style still missing or failed, treating checking as done", () => {
    expect(resumePoint(voice("active", { calm: "checking", excited: "missing" }))).toBe("excited");
    expect(resumePoint(voice("active", { deep: "missing", child: "failed" }))).toBe("deep");
    expect(resumePoint(voice("active", { child: "failed" }))).toBe("child");
  });

  it("skips a missing soft recording but sends a failed one back", () => {
    expect(resumePoint(voice("active", { soft: "missing" }))).toBe("belt");
    expect(resumePoint(voice("active", { soft: "failed" }))).toBe("soft");
    expect(resumePoint(voice("active", { soft: "failed", excited: "missing" }))).toBe("excited");
  });

  it("is ready when consent is active and every required clip passed, with soft passed or not recorded", () => {
    expect(isVoiceReady(voice("active"))).toBe(true);
    expect(isVoiceReady(voice("active", { soft: "missing" }))).toBe(true);
    expect(isVoiceReady(voice("active", { soft: "failed" }))).toBe(false);
    expect(isVoiceReady(voice("active", { soft: "checking" }))).toBe(false);
    expect(isVoiceReady(voice("active", { child: "missing" }))).toBe(false);
    expect(isVoiceReady(voice("checking"))).toBe(false);
  });

  it("offers soft only while it has not been recorded", () => {
    expect(optionalStyleToOffer(voice("active", { soft: "missing" }))).toBe("soft");
    expect(optionalStyleToOffer(voice("active", { soft: "failed" }))).toBeUndefined();
    expect(optionalStyleToOffer(voice("active"))).toBeUndefined();
  });
});
