export type RangeDecision =
  | { readonly kind: "full" }
  | { readonly kind: "partial"; readonly start: number; readonly end: number }
  | { readonly kind: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;
const FULL: RangeDecision = { kind: "full" };
const UNSATISFIABLE: RangeDecision = { kind: "unsatisfiable" };

const suffixRange = (length: number, totalBytes: number): RangeDecision =>
  length === 0 ? UNSATISFIABLE : { kind: "partial", start: Math.max(totalBytes - length, 0), end: totalBytes - 1 };

const boundedRange = (start: number, requestedEnd: number, totalBytes: number): RangeDecision => {
  if (start >= totalBytes || requestedEnd < start) return UNSATISFIABLE;
  return { kind: "partial", start, end: Math.min(requestedEnd, totalBytes - 1) };
};

// 여러 구간 요청과 잘못된 헤더는 RFC 9110대로 무시하고 전체를 보낸다.
export const decideRange = (header: string | undefined, totalBytes: number): RangeDecision => {
  const match = header === undefined ? null : SINGLE_RANGE.exec(header);
  if (match === null) return FULL;
  const [, startText = "", endText = ""] = match;
  if (startText === "" && endText === "") return FULL;
  if (startText === "") return suffixRange(Number(endText), totalBytes);
  const requestedEnd = endText === "" ? totalBytes - 1 : Number(endText);
  return boundedRange(Number(startText), requestedEnd, totalBytes);
};
