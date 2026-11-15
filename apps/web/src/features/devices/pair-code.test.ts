import { describe, expect, it } from "vitest";

import { formatPairCode, isCompletePairCode, readPairCode } from "./pair-code";

describe("pair code from the car QR", () => {
  it("reads the raw code the car puts after ?code=", () => {
    expect(readPairCode("?code=ABCD2345")).toBe("ABCD2345");
  });

  it("accepts the dashed, lower-case, or spaced form a parent might type", () => {
    expect(readPairCode("?code=abcd-2345")).toBe("ABCD2345");
    expect(readPairCode("?code=ABCD%202345")).toBe("ABCD2345");
  });

  it("rejects missing, short, and look-alike characters the server never issues", () => {
    expect(readPairCode("")).toBeNull();
    expect(readPairCode("?code=ABC")).toBeNull();
    expect(readPairCode("?code=ABCD2340")).toBeNull();
    expect(isCompletePairCode("ABCDI234")).toBe(false);
  });

  it("shows the code in two groups of four like the car screen", () => {
    expect(formatPairCode("ABCD2345")).toBe("ABCD-2345");
  });
});
