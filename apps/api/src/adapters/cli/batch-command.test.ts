import { describe, expect, it } from "vitest";

import { parseBatchCommand } from "./batch-command";

const JOB = ["--job-dir", "/tmp/job"];

describe("batch command", () => {
  it("parses a start with its options", () => {
    const args = ["start", "--voice", "v1", "--story", "masteraway", "--clip", "c1", "--clip", "c2", "--styles", "calm,excited", "--resume", ...JOB];
    expect(parseBatchCommand(args)).toEqual({
      kind: "start",
      input: { voiceId: "v1", storyId: "masteraway", clipIds: ["c1", "c2"], onlyStyles: ["calm", "excited"], resume: true },
      jobDirectory: "/tmp/job",
    });
  });

  it("does not resume unless asked", () => {
    const command = parseBatchCommand(["start", "--voice", "v1", "--story", "s", ...JOB]);
    expect(command).toMatchObject({ input: { resume: undefined, clipIds: undefined, onlyStyles: undefined } });
  });

  it("parses the operator's queue commands without a job folder", () => {
    expect(parseBatchCommand(["queued"])).toEqual({ kind: "queued" });
    expect(parseBatchCommand(["abandon", "--render", "r1"])).toEqual({ kind: "abandon", renderId: "r1" });
    expect(() => parseBatchCommand(["abandon"])).toThrow("--render");
  });

  it("parses a publish", () => {
    expect(parseBatchCommand(["publish", ...JOB])).toEqual({ kind: "publish", jobDirectory: "/tmp/job" });
  });

  it.each([
    [["start", "--story", "s", ...JOB], "--voice"],
    [["start", "--voice", "v", ...JOB], "--story"],
    [["start", "--voice", "v", "--story", "s"], "--job-dir"],
    [["render", ...JOB], "알 수 없는 명령"],
    [[...JOB], "알 수 없는 명령"],
    [["start", "--voice", "v", "--story", "s", "--styles", "calm,whisper", ...JOB], "알 수 없는 style이다: whisper"],
  ])("refuses %j", (args, message) => {
    expect(() => parseBatchCommand(args)).toThrow(message);
  });

  it("refuses an unknown option", () => {
    expect(() => parseBatchCommand(["publish", "--force", ...JOB])).toThrow();
  });
});
