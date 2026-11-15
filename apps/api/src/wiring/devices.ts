import { randomUUID } from "node:crypto";

import { createAccountRepo } from "../adapters/db/repos/account-repo";
import { createDeviceRepo } from "../adapters/db/repos/device-repo";
import { createPairingRepo } from "../adapters/db/repos/pairing-repo";
import { createQuickStartRepo } from "../adapters/db/repos/quick-start-repo";
import { createSessionRepo } from "../adapters/db/repos/session-repo";
import { ipRateLimit } from "../adapters/http/ip-rate-limit";
import { deviceRoutes } from "../adapters/http/routes/device-routes";
import {
  authenticateDevice,
  confirmPairing,
  listDevices,
  pollPairing,
  quickStart,
  redeemDemoCode,
  revokeDevice,
  startPairing,
} from "../application/devices";
import { POLICY, type Env } from "../config";
import { quickStartEmail } from "../domain/identity/quick-start-email";
import { hashDemoCode, type DemoPairing } from "../domain/devices/demo-code";
import type { Infrastructure } from "./infrastructure";

export const wireDeviceLookup = ({ database, clock }: Infrastructure) =>
  authenticateDevice({ devices: createDeviceRepo(database), clock });

const demoPairingOf = (env: Env): DemoPairing | null => {
  const { DEMO_PAIRING_CODE: code, DEMO_USER_ID: userId, DEMO_PAIRING_UNTIL: until } = env;
  if (code === undefined || userId === undefined || until === undefined) return null;
  return { codeHash: hashDemoCode(code), userId, untilMs: Date.parse(until) };
};

type IpLimitOptions = Parameters<typeof ipRateLimit>[0];

// 꺼진 배포에서는 경로도, 한도 계수기도 만들지 않는다.
const wireQuickStartRoute = (env: Env, { database, clock }: Pick<Infrastructure, "database" | "clock">, ipLimit: IpLimitOptions) => {
  if (env.QUICK_START !== "enabled") return null;
  const start = quickStart({
    quickStarts: createQuickStartRepo(database),
    sessions: createSessionRepo(database),
    clock,
    sessionTtlMs: POLICY.quickStartSessionTtlMs,
    termsVersion: env.TERMS_VERSION,
    aiNoticeVersion: env.AI_NOTICE_VERSION,
    newAccountEmail: () => quickStartEmail(randomUUID()),
  });
  return { start, ipLimit: ipRateLimit(ipLimit) };
};

export const wireDeviceRoutes = (env: Env, { database, clock, remoteAddress }: Infrastructure) => {
  const { ttlMs, intervalMs, ipHitsPerHour: limit, ipWindowMs: windowMs } = POLICY.pairing;
  const pairingDeps = { pairings: createPairingRepo(database), clock, ttlMs, intervalMs };
  const deviceDeps = { devices: createDeviceRepo(database), clock };
  const demo = demoPairingOf(env);
  const ipLimit = { limit, windowMs, clock, trustProxy: env.TRUST_PROXY, remoteAddress };
  const accounts = createAccountRepo(database);
  const accountExists = async (userId: string) => (await accounts.find(userId)) !== null;
  return deviceRoutes({
    startPairing: startPairing(pairingDeps),
    confirmPairing: confirmPairing(pairingDeps),
    quickStart: wireQuickStartRoute(env, { database, clock }, ipLimit),
    pollPairing: pollPairing(pairingDeps),
    listDevices: listDevices(deviceDeps),
    revokeDevice: revokeDevice(deviceDeps),
    verificationUri: `${env.PUBLIC_ORIGIN}/pair`,
    redeemDemoCode: demo === null ? null : redeemDemoCode({ ...pairingDeps, demo, accountExists }),
    pairStartIpLimit: ipRateLimit(ipLimit),
  });
};
