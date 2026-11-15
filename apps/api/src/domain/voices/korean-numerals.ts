const DIGIT_RUN = /(\d+)/;
const THOUSANDS_COMMA = /(?<=\d),(?=\d{3})/g;
const SINO_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"] as const;
const SINO_PLACES = [[1000, "천"], [100, "백"], [10, "십"], [1, ""]] as const;
const NATIVE_ONES = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"] as const;
const NATIVE_ONES_ATTRIBUTIVE = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"] as const;
const NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"] as const;
const NATIVE_MAX = 99;
const MAX_NUMBER_RUNS = 4;

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];

// 십·백·천 앞의 1은 읽지 않는다(일십이 아니라 십).
const sinoBelow10000 = (n: number): string =>
  SINO_PLACES.map(([place, unit]) => {
    const digit = Math.floor(n / place) % 10;
    if (digit === 0) return "";
    return (digit === 1 && unit ? "" : (SINO_DIGITS[digit] ?? "")) + unit;
  }).join("");

export const sinoReading = (n: number): string => {
  if (n === 0) return "영";
  const man = Math.floor(n / 10000);
  const rest = sinoBelow10000(n % 10000);
  if (man === 0) return rest;
  return `${man === 1 ? "" : sinoReading(man)}만${rest}`;
};

// 단독형(하나, 스물)과 관형형(한 개, 스무 살). 고유어 수사는 99까지만 쓴다.
export const nativeReadings = (n: number): readonly string[] => {
  if (n < 1 || n > NATIVE_MAX) return [];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensWord = NATIVE_TENS[tens] ?? "";
  const attributiveTens = tens === 2 && ones === 0 ? "스무" : tensWord;
  return unique([
    tensWord + (NATIVE_ONES[ones] ?? ""),
    attributiveTens + (NATIVE_ONES_ATTRIBUTIVE[ones] ?? ""),
  ]);
};

const numberReadings = (n: number): readonly string[] => unique([sinoReading(n), ...nativeReadings(n)]);

// 숫자가 많으면 조합이 폭발하므로 한자어 읽기 하나로 줄인다.
export const readingCandidates = (text: string): readonly string[] => {
  const parts = text.replace(THOUSANDS_COMMA, "").split(DIGIT_RUN);
  const numberRuns = (parts.length - 1) / 2;
  if (numberRuns === 0) return [text];
  const expand = numberRuns <= MAX_NUMBER_RUNS ? numberReadings : (n: number) => [sinoReading(n)];
  const options = parts.map((part, index) => (index % 2 ? expand(Number(part)) : [part]));
  return options.reduce<readonly string[]>(
    (prefixes, choices) => prefixes.flatMap((prefix) => choices.map((choice) => prefix + choice)),
    [""],
  );
};
