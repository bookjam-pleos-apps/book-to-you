export type DevicePairing = {
  readonly expiresAtMs: number;
  readonly confirmedAtMs: number | null;
  readonly consumedAtMs: number | null;
  readonly lastPolledAtMs: number | null;
};

export type PairingPollVerdict =
  | "issue_token"
  | "authorization_pending"
  | "slow_down"
  | "expired_token"
  | "invalid_grant";

export const judgePairingPoll = (
  pairing: DevicePairing,
  nowMs: number,
  minIntervalMs: number,
): PairingPollVerdict => {
  if (pairing.consumedAtMs !== null) return "invalid_grant";
  if (nowMs >= pairing.expiresAtMs) return "expired_token";
  // RFC 8628의 slow_down은 "아직 대기 중"이라는 뜻이고, 토큰은 한 번만 발급되어 폴링이 끝난다.
  if (pairing.confirmedAtMs !== null) return "issue_token";
  const pollsTooFast =
    pairing.lastPolledAtMs !== null && nowMs - pairing.lastPolledAtMs < minIntervalMs;
  return pollsTooFast ? "slow_down" : "authorization_pending";
};
