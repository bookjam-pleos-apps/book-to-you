import { describe, expect, it } from "vitest";

import { micHelpFor } from "./mic-help";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const GALAXY = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("micHelpFor", () => {
  it("기기마다 마이크를 다시 켜는 길을 알려 준다", () => {
    expect(micHelpFor(IPHONE)).toContain("가가");
    expect(micHelpFor(GALAXY)).toContain("자물쇠");
    expect(micHelpFor(MAC)).toContain("주소창의 설정");
  });
});
