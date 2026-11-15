import { describe, expect, it } from "vitest";

import { choosePairEntry } from "./pair-entry-choice";

const CODE = "ABCDEFGH";

describe("choosePairEntry", () => {
  it("offers quick start with the code to a signed-out phone that brought one", () => {
    expect(choosePairEntry({ signedIn: false, code: CODE, quickStart: true })).toEqual({ kind: "quick-start", code: CODE });
  });

  it("keeps the code confirm flow for signed-in phones and bare visits", () => {
    expect(choosePairEntry({ signedIn: true, code: CODE, quickStart: true })).toEqual({ kind: "confirm" });
    expect(choosePairEntry({ signedIn: undefined, code: CODE, quickStart: true })).toEqual({ kind: "confirm" });
    expect(choosePairEntry({ signedIn: false, code: null, quickStart: true })).toEqual({ kind: "confirm" });
  });

  it("waits for the deployment options before sending a signed-out phone to login", () => {
    expect(choosePairEntry({ signedIn: false, code: CODE, quickStart: undefined })).toEqual({ kind: "loading" });
  });

  it("falls back to login where quick start is off", () => {
    expect(choosePairEntry({ signedIn: false, code: CODE, quickStart: false })).toEqual({ kind: "confirm" });
  });
});
