import {
  authOptionsResponseSchema,
  otpRequestSchema,
  otpVerifyRequestSchema,
  termsResponseSchema,
} from "@voice-storybook/shared/contracts/v1";
import type { Hono, MiddlewareHandler } from "hono";

import type { Account, RequestOtpResult, VerifyOtpInput, VerifyOtpResult } from "../../../application/identity";
import { readJson } from "../errors";
import { failureCodeResponse } from "../failure-status";
import { toMeResponse } from "../me-response";
import { requireSessionUser, type AppEnv } from "../principal";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "../session-cookie";

export type OtpRouteDeps = {
  readonly requestOtp: (email: string) => Promise<RequestOtpResult>;
  readonly verifyOtp: (input: VerifyOtpInput) => Promise<VerifyOtpResult>;
  readonly otpIpLimit: MiddlewareHandler<AppEnv>;
};

export type AuthRouteDeps = {
  // null이면 로그인이 꺼진 배포다.
  readonly otp: OtpRouteDeps | null;
  readonly logout: (token: string) => Promise<void>;
  readonly getAccount: (userId: string) => Promise<Account | null>;
  readonly deleteAccount: (userId: string) => Promise<boolean>;
  readonly currentTerms: { readonly termsVersion: string; readonly aiNoticeVersion: string };
  readonly quickStartEnabled: boolean;
};

const registerOtpRoutes = (app: Hono<AppEnv>, deps: OtpRouteDeps): void => {
  app.post("/v1/auth/otp/request", deps.otpIpLimit, async (c) => {
    const body = await readJson(c, otpRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const result = await deps.requestOtp(body.email);
    return result.kind === "sent" ? c.body(null, 202) : failureCodeResponse(c, "too_many_requests");
  });
  app.post("/v1/auth/otp/verify", deps.otpIpLimit, async (c) => {
    const body = await readJson(c, otpVerifyRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const result = await deps.verifyOtp(body);
    if (result.kind !== "ok") return failureCodeResponse(c, result.kind);
    writeSessionCookie(c, result.sessionToken, result.maxAgeSec);
    return c.json(toMeResponse({ id: result.userId, email: body.email }));
  });
};

const registerDisabledOtpRoutes = (app: Hono<AppEnv>): void => {
  app.post("/v1/auth/otp/request", (c) => failureCodeResponse(c, "login_disabled"));
  app.post("/v1/auth/otp/verify", (c) => failureCodeResponse(c, "login_disabled"));
};

const registerSessionRoutes = (app: Hono<AppEnv>, deps: AuthRouteDeps): void => {
  app.post("/v1/auth/logout", async (c) => {
    const token = readSessionCookie(c);
    if (token !== undefined) await deps.logout(token);
    clearSessionCookie(c);
    return c.body(null, 204);
  });
  app.get("/v1/me", async (c) => {
    const account = await deps.getAccount(requireSessionUser(c.get("principal")));
    return account === null ? failureCodeResponse(c, "not_found") : c.json(toMeResponse(account));
  });
  app.delete("/v1/me", async (c) => {
    await deps.deleteAccount(requireSessionUser(c.get("principal")));
    clearSessionCookie(c);
    return c.body(null, 204);
  });
};

export const authRoutes =
  (deps: AuthRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    app.get("/v1/terms", (c) => c.json(termsResponseSchema.parse(deps.currentTerms)));
    app.get("/v1/auth/options", (c) =>
      c.json(authOptionsResponseSchema.parse({ emailLogin: deps.otp !== null, quickStart: deps.quickStartEnabled })),
    );
    if (deps.otp === null) registerDisabledOtpRoutes(app);
    else registerOtpRoutes(app, deps.otp);
    registerSessionRoutes(app, deps);
  };
