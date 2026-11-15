import { createHmac } from "node:crypto";

import { sameSecretText } from "../constant-time";

const SEPARATOR = ".";

export type PhraseClaims = {
  readonly voiceId: string;
  readonly phrase: string;
  readonly expiresAtMs: number;
};

const signature = (secret: string, payload: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const encodePayload = ({ voiceId, phrase, expiresAtMs }: PhraseClaims): string =>
  [voiceId, String(expiresAtMs), Buffer.from(phrase).toString("base64url")].join(SEPARATOR);

export const signPhraseToken = (secret: string, claims: PhraseClaims): string => {
  const payload = encodePayload(claims);
  return `${payload}${SEPARATOR}${signature(secret, payload)}`;
};

const signatureMatches = (secret: string, payload: string, given: string): boolean =>
  sameSecretText(signature(secret, payload), given);

// 동의 전의 행을 영수증 테이블에 넣지 않으려고 문구를 서명 토큰으로 돌려받는다.
export const readPhraseToken = (secret: string, token: string, nowMs: number): PhraseClaims | null => {
  const [voiceId, expiresAt, encodedPhrase, given, ...rest] = token.split(SEPARATOR);
  if (voiceId === undefined || expiresAt === undefined || encodedPhrase === undefined || given === undefined) return null;
  if (rest.length > 0) return null;
  if (!signatureMatches(secret, [voiceId, expiresAt, encodedPhrase].join(SEPARATOR), given)) return null;
  const expiresAtMs = Number(expiresAt);
  if (nowMs >= expiresAtMs) return null;
  return { voiceId, expiresAtMs, phrase: Buffer.from(encodedPhrase, "base64url").toString() };
};
