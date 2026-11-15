import { characterErrorRate, transcriptContains } from "./cer";
import { consentChallengeOf } from "./consent-phrase";

export type RecordingMatch = {
  readonly passed: boolean;
  readonly errorRate: number;
};

export const judgeClipReading = (script: string, transcript: string, maxErrorRate: number): RecordingMatch => {
  const errorRate = characterErrorRate(script, transcript);
  return { passed: errorRate <= maxErrorRate, errorRate };
};

// 확인 문구는 문장 전체의 11%뿐이라 전부 틀려도 문자 오류율 기준을 통과한다. 이 문구를 읽었다는 증거는 따로 본다.
export const judgeConsentReading = (phrase: string, transcript: string, maxErrorRate: number): RecordingMatch => {
  const { passed, errorRate } = judgeClipReading(phrase, transcript, maxErrorRate);
  const challenge = consentChallengeOf(phrase);
  return { passed: passed && challenge !== null && transcriptContains(transcript, challenge), errorRate };
};
