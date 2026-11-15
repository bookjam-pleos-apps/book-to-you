import type { RandomBytes } from "./random";
import { sha256Hex } from "./sha256";

const TOKEN_BYTES = 32;

export const createSecretToken = (randomBytes: RandomBytes): string =>
  Buffer.from(randomBytes(TOKEN_BYTES)).toString("base64url");

// 토큰은 추측할 수 없는 난수라 느린 해시가 필요 없다. DB에는 이 값만 저장한다.
export const hashSecretToken = (token: string): string => sha256Hex(token);
