import { createAccountRepo } from "../adapters/db/repos/account-repo";
import { createDeletionRepo } from "../adapters/db/repos/deletion-repo";
import { createOtpRepo } from "../adapters/db/repos/otp-repo";
import { createSessionRepo } from "../adapters/db/repos/session-repo";
import { ipRateLimit } from "../adapters/http/ip-rate-limit";
import { authRoutes } from "../adapters/http/routes/auth-routes";
import { deleteAccount, getAccount, logout, requestOtp, resolveSession, verifyOtp } from "../application/identity";
import { POLICY, type Env } from "../config";
import type { Infrastructure } from "./infrastructure";

export const wireSessionLookup = ({ database, clock }: Infrastructure) =>
  resolveSession({ sessions: createSessionRepo(database), clock });

const wireVerifyOtp = (env: Env, { database, clock }: Infrastructure) =>
  verifyOtp({
    otps: createOtpRepo(database),
    accounts: createAccountRepo(database),
    sessions: createSessionRepo(database),
    clock,
    secret: env.AUTH_SECRET,
    limits: POLICY.otp.limits,
    sessionTtlMs: POLICY.sessionTtlMs,
    termsVersion: env.TERMS_VERSION,
    aiNoticeVersion: env.AI_NOTICE_VERSION,
  });

export const wireIdentityRoutes = (env: Env, infrastructure: Infrastructure) => {
  const { database, mailer, clock, queue, remoteAddress } = infrastructure;
  const accounts = createAccountRepo(database);
  const sessions = createSessionRepo(database);
  const { ttlMs, limits, ipHitsPerHour: limit, ipWindowMs: windowMs } = POLICY.otp;
  const otp =
    mailer === null
      ? null
      : {
          requestOtp: requestOtp({ otps: createOtpRepo(database), mailer, clock, secret: env.AUTH_SECRET, ttlMs, limits }),
          verifyOtp: wireVerifyOtp(env, infrastructure),
          otpIpLimit: ipRateLimit({ limit, windowMs, clock, trustProxy: env.TRUST_PROXY, remoteAddress }),
        };
  return authRoutes({
    otp,
    logout: logout({ sessions }),
    getAccount: getAccount({ accounts }),
    deleteAccount: deleteAccount({ deletion: createDeletionRepo(database), queue, clock }),
    currentTerms: { termsVersion: env.TERMS_VERSION, aiNoticeVersion: env.AI_NOTICE_VERSION },
    quickStartEnabled: env.QUICK_START === "enabled",
  });
};
