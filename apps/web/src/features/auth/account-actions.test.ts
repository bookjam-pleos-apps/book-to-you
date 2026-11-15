import { describe, expect, it } from "vitest";

import { afterAccountDeleted } from "./account-actions";

describe("afterAccountDeleted", () => {
  it("시작 화면으로 옮긴 다음에 캐시를 지운다", () => {
    const calls: string[] = [];
    afterAccountDeleted({ navigate: (path) => calls.push(`navigate ${path}`), clear: () => calls.push("clear") });
    expect(calls).toEqual(["navigate /", "clear"]);
  });
});
