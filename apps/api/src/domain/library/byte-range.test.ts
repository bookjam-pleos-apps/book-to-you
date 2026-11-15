import { describe, expect, it } from "vitest";

import { decideRange } from "./byte-range";

describe("decideRange", () => {
  it.each([
    [undefined, { kind: "full" }],
    ["bytes=0-9", { kind: "partial", start: 0, end: 9 }],
    ["bytes=90-", { kind: "partial", start: 90, end: 99 }],
    ["bytes=-10", { kind: "partial", start: 90, end: 99 }],
    ["bytes=-500", { kind: "partial", start: 0, end: 99 }],
    ["bytes=90-500", { kind: "partial", start: 90, end: 99 }],
    ["bytes=100-", { kind: "unsatisfiable" }],
    ["bytes=-0", { kind: "unsatisfiable" }],
    ["bytes=5-1", { kind: "unsatisfiable" }],
    ["bytes=0-1,5-6", { kind: "full" }],
    ["items=0-1", { kind: "full" }],
    ["bytes=-", { kind: "full" }],
  ])("decides %s against 100 bytes", (header, expected) => {
    expect(decideRange(header, 100)).toEqual(expected);
  });
});
