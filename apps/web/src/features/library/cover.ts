// 표지는 서버가 주지 않는다. 차량 앱(core/shelf/Cover.kt)과 같게 앱에 넣은 그림을 이야기 id로 고르고,
// 그림이 없는 이야기는 색 블록으로 둔다. 같은 이야기는 두 앱에서 같은 색이 되도록 규칙을 맞춘다.
export type CoverTone = "red" | "sea" | "mint";

export type CoverShape = "portrait" | "landscape";

export type CoverArtSet = { readonly portrait?: string; readonly landscape?: string };

export type CoverArt = { readonly src: string; readonly shape: CoverShape };

export type Cover = { readonly tone: CoverTone; readonly art: CoverArt | null };

const TONE_COUNT = 3;

const DEMO_TONES: Readonly<Record<string, CoverTone>> = { redhood: "red", fisherman: "sea", masteraway: "mint" };

// Java String.hashCode와 같은 값이다(UTF-16 코드 단위, 32비트 정수 넘침).
export const javaHashCode = (text: string): number =>
  Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).reduce((hash, code) => (Math.imul(hash, 31) + code) | 0, 0);

const floorMod = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

// 차량 앱 CoverTone.entries 순서(Red, Sea, Mint)와 같다.
const toneAtRemainder = (remainder: number): CoverTone => {
  if (remainder === 0) return "red";
  return remainder === 1 ? "sea" : "mint";
};

export const toneOf = (storyId: string): CoverTone =>
  DEMO_TONES[storyId] ?? toneAtRemainder(floorMod(javaHashCode(storyId), TONE_COUNT));

const OTHER_SHAPE: Readonly<Record<CoverShape, CoverShape>> = { portrait: "landscape", landscape: "portrait" };

// 원하는 비율이 없으면 다른 비율 그림을 그 비율 그대로 쓴다. 자르지 않아 초점 표가 필요 없다.
export const pickArt = (set: CoverArtSet | undefined, shape: CoverShape): CoverArt | null => {
  const wanted = set?.[shape];
  if (wanted !== undefined) return { src: wanted, shape };
  const other = set?.[OTHER_SHAPE[shape]];
  return other === undefined ? null : { src: other, shape: OTHER_SHAPE[shape] };
};

export const coverOf = (table: Readonly<Record<string, CoverArtSet>>, storyId: string, shape: CoverShape): Cover => ({
  tone: toneOf(storyId),
  art: pickArt(table[storyId], shape),
});
