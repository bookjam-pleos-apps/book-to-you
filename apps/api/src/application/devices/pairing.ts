import { randomBytes, randomInt } from "node:crypto";

import { DEVICE_SCOPE } from "../../domain/devices/device-scope";
import { judgePairingPoll, type PairingPollVerdict } from "../../domain/devices/pairing-code";
import { createUserCode, normalizeUserCode } from "../../domain/devices/user-code";
import { createSecretToken, hashSecretToken } from "../../domain/secret-token";
import type { Clock } from "../ports/clock";
import type { Pairing, PairingRepo } from "./ports";

export type PairingDeps = {
  readonly pairings: PairingRepo;
  readonly clock: Clock;
  readonly ttlMs: number;
  readonly intervalMs: number;
};

export type StartedPairing = {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly expiresInSec: number;
  readonly intervalSec: number;
};

export const startPairing =
  ({ pairings, clock, ttlMs, intervalMs }: PairingDeps) =>
  async (deviceName: string): Promise<StartedPairing> => {
    const deviceCode = createSecretToken(randomBytes);
    const userCode = createUserCode(randomInt);
    const expiresAt = new Date(clock().getTime() + ttlMs);
    await pairings.create({ deviceCodeHash: hashSecretToken(deviceCode), userCode, deviceName, expiresAt });
    return { deviceCode, userCode, expiresInSec: ttlMs / 1000, intervalSec: intervalMs / 1000 };
  };

export const confirmPairing =
  ({ pairings, clock }: PairingDeps) =>
  (userCode: string, userId: string): Promise<boolean> =>
    pairings.confirm(normalizeUserCode(userCode), userId, clock());

export type PollResult =
  | { readonly kind: "token"; readonly accessToken: string }
  | { readonly kind: Exclude<PairingPollVerdict, "issue_token"> };

const judgePoll = (pairing: Pairing, now: Date, intervalMs: number): PairingPollVerdict =>
  judgePairingPoll(
    {
      expiresAtMs: pairing.expiresAt.getTime(),
      confirmedAtMs: pairing.confirmedAt?.getTime() ?? null,
      consumedAtMs: pairing.consumedAt?.getTime() ?? null,
      lastPolledAtMs: pairing.lastPolledAt?.getTime() ?? null,
    },
    now.getTime(),
    intervalMs,
  );

const issueToken = async (pairings: PairingRepo, pairing: Pairing, now: Date): Promise<PollResult> => {
  if (pairing.userId === null) return { kind: "invalid_grant" };
  const accessToken = createSecretToken(randomBytes);
  const issued = await pairings.consumeIntoDevice({
    pairingId: pairing.id,
    tokenHash: hashSecretToken(accessToken),
    userId: pairing.userId,
    name: pairing.deviceName,
    scope: DEVICE_SCOPE,
    now,
  });
  return issued ? { kind: "token", accessToken } : { kind: "invalid_grant" };
};

export const pollPairing =
  ({ pairings, clock, intervalMs }: PairingDeps) =>
  async (deviceCode: string): Promise<PollResult> => {
    const pairing = await pairings.findByDeviceCodeHash(hashSecretToken(deviceCode));
    if (pairing === null) return { kind: "invalid_grant" };
    const now = clock();
    const verdict = judgePoll(pairing, now, intervalMs);
    await pairings.recordPoll(pairing.id, now);
    return verdict === "issue_token" ? issueToken(pairings, pairing, now) : { kind: verdict };
  };
