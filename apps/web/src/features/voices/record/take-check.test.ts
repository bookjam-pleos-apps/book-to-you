import { describe, expect, it } from "vitest";

import type { MicProcessing } from "../../../lib/recorder/recording-format";
import { RETRY_WITH_DEFAULT_FEEDBACK, SILENT_TAKE_FEEDBACK, takeProblem } from "./take-check";

const clip = (durationMs: number, peak: number | null, processing: MicProcessing = "browser") => ({
  blob: new Blob(["x"]),
  durationMs,
  peak,
  processing,
  micCheck: null,
});

describe("take check before upload", () => {
  it("stops a silent take even when it ran long enough", () => {
    expect(takeProblem("clip", clip(15_000, 0.002))).toBe(SILENT_TAKE_FEEDBACK);
  });

  it("asks for one more take when the raw microphone recorded silence, since the next opens with browser processing", () => {
    expect(takeProblem("clip", clip(15_000, 0.002, "off"))).toBe(RETRY_WITH_DEFAULT_FEEDBACK);
  });

  it("reports silence before shortness, since the server would call silence too_short", () => {
    expect(takeProblem("clip", clip(4_000, 0))).toBe(SILENT_TAKE_FEEDBACK);
  });

  it("still catches a short take with a real voice", () => {
    expect(takeProblem("clip", clip(4_000, 0.3))?.title).toBe("조금 짧아요");
  });

  it("lets a long enough take pass, including one whose level could not be measured", () => {
    expect(takeProblem("clip", clip(12_000, 0.3))).toBeNull();
    expect(takeProblem("clip", clip(12_000, null))).toBeNull();
  });
});
