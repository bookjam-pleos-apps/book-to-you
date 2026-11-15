import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { describe, expect, it } from "vitest";

import { clipOutcome, consentOutcome } from "./upload-outcome";

const base: VoiceResponse = { id: "v1", label: "엄마", consent: "none", consentRejected: false, isDefault: false, clips: [], progress: [] };

describe("upload outcome", () => {
  it("reads the consent reading result from the voice", () => {
    expect(consentOutcome({ ...base, consent: "active" })).toBe("passed");
    expect(consentOutcome({ ...base, consentRejected: true })).toBe("failed");
    expect(consentOutcome({ ...base, consent: "checking" })).toBe("checking");
  });

  it("looks up the uploaded clip by id, not by style", () => {
    const voice: VoiceResponse = {
      ...base,
      clips: [
        { id: "old", style: "calm", status: "failed", failure: "script_mismatch", advice: null },
        { id: "new", style: "calm", status: "passed", failure: null, advice: null },
      ],
    };
    expect(clipOutcome(voice, "new")).toBe("passed");
    expect(clipOutcome(voice, "old")).toBe("failed");
    expect(clipOutcome(voice, "missing")).toBe("checking");
  });

  it("holds a passed clip that came with coaching instead of moving on", () => {
    const voice: VoiceResponse = { ...base, clips: [{ id: "coached", style: "child", status: "passed", failure: null, advice: "not_distinct" }] };
    expect(clipOutcome(voice, "coached")).toBe("advised");
  });
});
