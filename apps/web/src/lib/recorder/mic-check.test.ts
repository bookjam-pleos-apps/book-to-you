import { describe, expect, it } from "vitest";

import { MIC_ALIVE_FLOOR, MIC_CHECK_LIMIT_MS, micCheckLine, micCheckVerdict, needsMicCheck, takeLine } from "./mic-check";

describe("micCheckVerdict", () => {
  it("바닥 소음이 한 번이라도 잡히면 기다리지 않고 살아 있다고 본다", () => {
    expect(micCheckVerdict(MIC_ALIVE_FLOOR, 50)).toBe("alive");
    expect(micCheckVerdict(0.2, 0)).toBe("alive");
  });

  it("바닥 아래만 나오면 한도까지 기다린 뒤 죽었다고 본다", () => {
    expect(micCheckVerdict(0, MIC_CHECK_LIMIT_MS - 1)).toBe("wait");
    expect(micCheckVerdict(0, MIC_CHECK_LIMIT_MS)).toBe("dead");
    expect(micCheckVerdict(MIC_ALIVE_FLOOR / 2, MIC_CHECK_LIMIT_MS)).toBe("dead");
  });

  it("음량을 재지 못하면 한도까지 기다리고, 그래도 모르면 막지 않는다", () => {
    expect(micCheckVerdict(null, 100)).toBe("wait");
    expect(micCheckVerdict(null, MIC_CHECK_LIMIT_MS)).toBe("unknown");
  });

  it("바닥은 녹음 뒤 무음 검사(-40 dBFS)보다 훨씬 낮다", () => {
    expect(MIC_ALIVE_FLOOR).toBeLessThan(0.01);
  });
});

describe("micCheckLine", () => {
  it("판정, 바닥값(dBFS 함께), 걸린 시간을 한 줄로 적는다", () => {
    expect(micCheckLine({ verdict: "dead", peak: 0, afterMs: 1201 })).toBe("[mic-check] dead peak=0.00000 (-inf dBFS) after=1201ms");
    expect(micCheckLine({ verdict: "alive", peak: 0.01, afterMs: 150 })).toBe("[mic-check] alive peak=0.01000 (-40.0 dBFS) after=150ms");
    expect(micCheckLine({ verdict: "unknown", peak: null, afterMs: 1200 })).toBe("[mic-check] unknown peak=null after=1200ms");
  });
});

describe("needsMicCheck", () => {
  it("처리를 끈 마이크만, 음량을 잴 수 있을 때만 점검한다", () => {
    expect([needsMicCheck("off", true), needsMicCheck("browser", true), needsMicCheck("off", false)]).toEqual([true, false, false]);
  });
});

describe("takeLine", () => {
  it("녹음의 최대 입력과 점검 판정을 한 줄로 적는다", () => {
    expect(takeLine(0.004, { verdict: "alive", peak: 0.001, afterMs: 200 })).toBe("[mic-check] take peak=0.00400 check=alive");
    expect(takeLine(null, null)).toBe("[mic-check] take peak=null check=none");
  });
});
