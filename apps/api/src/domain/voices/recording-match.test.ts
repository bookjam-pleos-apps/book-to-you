import { describe, expect, it } from "vitest";

import { consentChallengeOf, createConsentPhrase } from "./consent-phrase";
import { judgeClipReading, judgeConsentReading } from "./recording-match";

const PHRASE = "저는 제 목소리로 동화를 만드는 데 동의합니다. 오늘의 확인 문구는 파란 사과 세 개입니다.";
const LIMIT = 0.2;

describe("consent reading", () => {
  it("passes the phrase read as written", () => {
    expect(judgeConsentReading(PHRASE, PHRASE, LIMIT)).toMatchObject({ passed: true, errorRate: 0 });
  });

  it("accepts the count written as a digit and different spacing", () => {
    const transcript = "저는 제 목소리로 동화를 만드는데 동의합니다 오늘의 확인 문구는 파란 사과 3개입니다";
    expect(judgeConsentReading(PHRASE, transcript, LIMIT).passed).toBe(true);
  });

  it("rejects another challenge even though the error rate alone would pass", () => {
    const transcript = "저는 제 목소리로 동화를 만드는 데 동의합니다. 오늘의 확인 문구는 노란 기차 두 개입니다.";
    const match = judgeConsentReading(PHRASE, transcript, LIMIT);
    expect(match.errorRate).toBeLessThan(LIMIT);
    expect(match.passed).toBe(false);
  });

  it("rejects a reading of something else and a phrase with no challenge", () => {
    expect(judgeConsentReading(PHRASE, "오늘 날씨가 좋네요", LIMIT).passed).toBe(false);
    expect(judgeConsentReading("동의합니다", "동의합니다", LIMIT).passed).toBe(false);
  });

  it("finds the challenge in every phrase the generator makes", () => {
    const phrases = [0, 1, 2, 3, 4, 5].map((pick) => createConsentPhrase(() => pick));
    expect(phrases.map(consentChallengeOf).every((challenge) => challenge?.endsWith(" 개") === true)).toBe(true);
    expect(phrases.every((phrase) => judgeConsentReading(phrase, phrase, LIMIT).passed)).toBe(true);
  });

  it("reads the challenge out of the phrase", () => {
    expect(consentChallengeOf(PHRASE)).toBe("파란 사과 세 개");
    expect(consentChallengeOf("동의합니다")).toBeNull();
  });
});

describe("clip reading", () => {
  it("passes a small transcription slip and fails another text", () => {
    const script = "옛날 옛적 바닷가 작은 마을에 등대지기 할아버지가 살았어요";
    expect(judgeClipReading(script, "옛날 옛적 바닷가 작은 마을에 등대직의 할아버지가 살았어요", LIMIT).passed).toBe(true);
    expect(judgeClipReading(script, "우와 저것 좀 봐", LIMIT).passed).toBe(false);
  });
});
