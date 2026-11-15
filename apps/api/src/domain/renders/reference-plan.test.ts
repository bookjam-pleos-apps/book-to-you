import type { Style } from "@voice-storybook/shared/vocab";
import { describe, expect, it } from "vitest";

import { planReferences, type ReferenceRules } from "./reference-plan";

const clip = (id: string, style: Style) => ({ id, style });
const CALM = clip("calm-1", "calm");
const EXCITED = clip("excited-1", "excited");
const SOFT = clip("soft-1", "soft");
const STORY: readonly Style[] = ["calm", "excited", "soft", "calm"];
const RULES: ReferenceRules = { policyReadAs: { soft: "calm" }, clipIds: [] };

describe("reference plan", () => {
  it("reads each style with its own recording and sends soft to calm by policy", () => {
    expect(planReferences(STORY, [SOFT, EXCITED, CALM], RULES)).toEqual({
      kind: "planned",
      readAs: { calm: "calm", excited: "excited", soft: "calm" },
      clips: [CALM, EXCITED],
    });
  });

  it("falls back to calm for a style without a recording", () => {
    expect(planReferences(STORY, [CALM], RULES)).toEqual({ kind: "planned", readAs: { calm: "calm", excited: "calm", soft: "calm" }, clips: [CALM] });
  });

  it("reads character voices with calm when the voice has no deep or child recording", () => {
    expect(planReferences(["calm", "deep", "child"], [CALM, clip("deep-1", "deep")], RULES)).toEqual({
      kind: "planned",
      readAs: { calm: "calm", deep: "deep", child: "calm" },
      clips: [CALM, clip("deep-1", "deep")],
    });
  });

  it("reads everything as calm when the operator keeps to calm", () => {
    const plan = planReferences(STORY, [CALM, EXCITED], { ...RULES, onlyStyles: new Set(["calm"]) });
    expect(plan).toEqual({ kind: "planned", readAs: { calm: "calm", excited: "calm", soft: "calm" }, clips: [CALM] });
  });

  it("refuses without any recording to fall back on", () => {
    expect(planReferences(STORY, [EXCITED], RULES)).toEqual({ kind: "no_passed_clip" });
    expect(planReferences(STORY, [], RULES)).toEqual({ kind: "no_passed_clip" });
  });

  it("asks which recording when a used style has several, and takes the named one", () => {
    const second = clip("excited-2", "excited");
    expect(planReferences(STORY, [CALM, EXCITED, second], RULES)).toEqual({ kind: "ambiguous_clip", style: "excited" });
    expect(planReferences(STORY, [CALM, EXCITED, second], { ...RULES, clipIds: ["excited-2"] })).toMatchObject({ clips: [CALM, second] });
  });

  it("ignores extra recordings of a style the story does not use", () => {
    expect(planReferences(["calm"], [CALM, EXCITED, clip("excited-2", "excited")], RULES)).toMatchObject({ kind: "planned", clips: [CALM] });
  });

  it("refuses a named clip that is not a usable passed recording", () => {
    expect(planReferences(STORY, [CALM], { ...RULES, clipIds: ["missing"] })).toEqual({ kind: "no_passed_clip" });
    expect(planReferences(STORY, [CALM, EXCITED], { ...RULES, onlyStyles: new Set(["calm"]), clipIds: ["excited-1"] })).toEqual({ kind: "no_passed_clip" });
  });
});
