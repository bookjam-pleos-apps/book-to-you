import { describe, expect, it } from "vitest";

import { HOME_PATH, loginPathReturningTo, readReturnPath, safeReturnPath } from "./return-path";

describe("return path after login", () => {
  it("brings the pair code back after login", () => {
    const login = loginPathReturningTo("/pair?code=ABCD2345");
    expect(readReturnPath(new URL(login, "https://x.test").search)).toBe("/pair?code=ABCD2345");
  });

  it("refuses paths that leave this origin", () => {
    expect(safeReturnPath("https://evil.test")).toBe(HOME_PATH);
    expect(safeReturnPath("//evil.test")).toBe(HOME_PATH);
    expect(safeReturnPath("/\\evil.test")).toBe(HOME_PATH);
    expect(safeReturnPath(null)).toBe(HOME_PATH);
  });

  it("refuses control characters the URL parser would strip into //host", () => {
    expect(safeReturnPath("/\t/evil.test")).toBe(HOME_PATH);
    expect(safeReturnPath("/\n/evil.test")).toBe(HOME_PATH);
    expect(safeReturnPath("/pair?code=ABCD2345")).toBe("/pair?code=ABCD2345");
  });
});
