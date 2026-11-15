import { describe, expect, it } from "vitest";

import { deriveProgress } from "./progress";

describe("deriveProgress", () => {
  it("reports every style in a fixed order even with no clips", () => {
    expect(deriveProgress([])).toEqual([
      { style: "calm", status: "missing" },
      { style: "excited", status: "missing" },
      { style: "soft", status: "missing" },
      { style: "deep", status: "missing" },
      { style: "child", status: "missing" },
    ]);
  });

  it("uses the best clip of a style", () => {
    const progress = deriveProgress([
      { style: "calm", status: "failed" },
      { style: "calm", status: "passed" },
      { style: "soft", status: "failed" },
      { style: "soft", status: "checking" },
    ]);
    expect(progress.map((item) => item.status)).toEqual(["passed", "missing", "checking", "missing", "missing"]);
  });
});
