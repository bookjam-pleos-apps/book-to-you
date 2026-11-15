import { timingSafeEqual } from "node:crypto";

// 비밀값에서 나온 문자열(해시, 서명)을 비교한다. 길이가 다르면 timingSafeEqual이 던지므로 먼저 거른다.
export const sameSecretText = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
};
