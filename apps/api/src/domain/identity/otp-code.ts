import { createHmac } from "node:crypto";

import { sameSecretText } from "../constant-time";
import type { RandomInt } from "../random";

const OTP_RANGE = 1_000_000;

export const createOtpCode = (randomInt: RandomInt): string => randomInt(OTP_RANGE).toString().padStart(6, "0");

export const hmacOtpCode = (secret: string, email: string, code: string): string =>
  createHmac("sha256", secret).update(`${email}\0${code}`).digest("hex");

export const otpCodeMatches = (secret: string, email: string, code: string, storedHmac: string): boolean =>
  sameSecretText(hmacOtpCode(secret, email, code), storedHmac);
