import type { RandomInt } from "../random";

// 차 화면에서 옮겨 적는 코드라 헷갈리는 문자(0, O, 1, I)를 뺀다.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export const createUserCode = (randomInt: RandomInt): string =>
  Array.from({ length: CODE_LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join("");

export const normalizeUserCode = (input: string): string => input.toUpperCase().replaceAll(/[^0-9A-Z]/g, "");
