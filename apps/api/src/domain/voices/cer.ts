import { readingCandidates } from "./korean-numerals";

const SCORED_CHARACTERS = /[가-힣a-z0-9]/g;

// 띄어쓰기와 문장부호는 Whisper가 임의로 바꾸므로 비교에서 뺀다.
// NFD 파일의 자모는 음절 범위에 들지 않아, 정규화하지 않으면 글자가 통째로 사라진다.
export const normalizeForCer = (text: string): readonly string[] =>
  text.normalize("NFC").toLowerCase().match(SCORED_CHARACTERS) ?? [];

const scoredText = (text: string): string => normalizeForCer(text).join("");

// 전사의 숫자는 읽는 법이 여럿이라("3개", "세 개") 그중 하나라도 포함하면 읽은 것으로 본다.
export const transcriptContains = (transcript: string, wanted: string): boolean => {
  const target = scoredText(wanted);
  return target.length > 0 && readingCandidates(transcript).some((candidate) => scoredText(candidate).includes(target));
};

const nextEditRow = (
  reference: readonly string[],
  previous: readonly number[],
  character: string,
): readonly number[] => {
  const row = [(previous[0] ?? 0) + 1];
  reference.forEach((referenceCharacter, index) => {
    const substituted = (previous[index] ?? 0) + (referenceCharacter === character ? 0 : 1);
    const deleted = (previous[index + 1] ?? 0) + 1;
    const inserted = (row[index] ?? 0) + 1;
    row.push(Math.min(substituted, deleted, inserted));
  });
  return row;
};

const editDistance = (reference: readonly string[], hypothesis: readonly string[]): number => {
  const firstRow = Array.from({ length: reference.length + 1 }, (_, index) => index);
  const lastRow = hypothesis.reduce<readonly number[]>(
    (row, character) => nextEditRow(reference, row, character),
    firstRow,
  );
  return lastRow[reference.length] ?? 0;
};

const plainErrorRate = (reference: string, hypothesis: string): number => {
  const scoredReference = normalizeForCer(reference);
  const scoredHypothesis = normalizeForCer(hypothesis);
  if (scoredReference.length === 0) return scoredHypothesis.length === 0 ? 0 : 1;
  return editDistance(scoredReference, scoredHypothesis) / scoredReference.length;
};

// 전사의 숫자는 읽는 법이 여럿이라, 정답에 가장 가까운 읽기로 잰다.
export const characterErrorRate = (reference: string, hypothesis: string): number =>
  Math.min(...readingCandidates(hypothesis).map((candidate) => plainErrorRate(reference, candidate)));
