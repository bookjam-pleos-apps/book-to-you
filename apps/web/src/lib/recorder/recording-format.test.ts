import { describe, expect, it } from "vitest";

import { fileExtensionFor, microphoneConstraints, pickRecordingMimeType } from "./recording-format";

describe("recording format", () => {
  it("prefers Opus webm and falls back to mp4 on Safari", () => {
    expect(pickRecordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });

  it("names the upload after the container the browser produced", () => {
    expect(fileExtensionFor("audio/mp4")).toBe("m4a");
    expect(fileExtensionFor("audio/webm;codecs=opus")).toBe("webm");
  });

  it("opens the raw microphone first and the browser default after a silent take", () => {
    expect(microphoneConstraints("off")).toEqual({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(microphoneConstraints("browser")).toEqual({ audio: true });
  });
});
