import { describe, expect, it } from "vitest";

import { historyStateOf, pathOf, previousStage, stageOf, type LoginStage } from "./login-stage";

describe("login stage from the address", () => {
  it("restores the code step after a refresh", () => {
    expect(stageOf("code", { agreed: true, email: "a@b.c" })).toEqual({ kind: "code", email: "a@b.c" });
  });

  it("sends someone who skipped the terms back to them", () => {
    expect(stageOf("email", null)).toEqual({ kind: "terms" });
    expect(stageOf("code", { email: "a@b.c" })).toEqual({ kind: "terms" });
  });

  it("asks for the email again when the code step has none", () => {
    expect(stageOf("code", { agreed: true })).toEqual({ kind: "email" });
  });

  it("round-trips a stage through its path and history state", () => {
    const stage: LoginStage = { kind: "code", email: "a@b.c" };
    expect(stageOf(pathOf(stage).split("/")[2], historyStateOf(stage))).toEqual(stage);
    expect(previousStage(stage)).toEqual({ kind: "email" });
    expect(previousStage({ kind: "terms" })).toBeNull();
  });
});
