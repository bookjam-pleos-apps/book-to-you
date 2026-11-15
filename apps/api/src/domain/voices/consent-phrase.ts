import type { RandomInt } from "../random";

const COLORS = ["파란", "노란", "빨간", "초록", "하얀", "보라"];
const THINGS = ["사과", "기차", "구름", "연필", "우산", "나무"];
const COUNTS = ["두", "세", "네", "다섯", "여섯", "일곱"];

const CHALLENGE = /오늘의 확인 문구는 (.+ 개)입니다\.$/;

export const consentChallengeOf = (phrase: string): string | null => CHALLENGE.exec(phrase)?.[1] ?? null;

export const createConsentPhrase = (randomInt: RandomInt): string => {
  const pick = (words: readonly string[]): string => words[randomInt(words.length)] ?? "";
  return `저는 제 목소리로 동화를 만드는 데 동의합니다. 오늘의 확인 문구는 ${pick(COLORS)} ${pick(THINGS)} ${pick(COUNTS)} 개입니다.`;
};
