import type { Context, MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";

import { judgeAccess } from "./access-policy";
import { failureCodeResponse } from "./failure-status";
import { ANONYMOUS, type AppEnv, type Principal } from "./principal";
import { readSessionCookie } from "./session-cookie";

export type Authenticator = {
  readonly session: (token: string) => Promise<string | null>;
  readonly device: (token: string) => Promise<{ readonly userId: string; readonly deviceId: string } | null>;
};

const BEARER = /^Bearer (\S+)$/;

const principalFromDeviceToken = async (authenticator: Authenticator, header: string): Promise<Principal | null> => {
  const token = BEARER.exec(header)?.[1];
  if (token === undefined) return null;
  const device = await authenticator.device(token);
  return device === null ? null : { kind: "device", ...device };
};

const principalFromSession = async (authenticator: Authenticator, c: Context): Promise<Principal> => {
  const token = readSessionCookie(c);
  if (token === undefined) return ANONYMOUS;
  const userId = await authenticator.session(token);
  return userId === null ? ANONYMOUS : { kind: "session", userId };
};

// Bearer를 보냈다면 그것만 판정한다. 폐기된 기기 토큰이 쿠키나 익명으로 넘어가면 안 된다.
export const authenticate =
  (authenticator: Authenticator): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const header = c.req.header("authorization");
    const principal =
      header === undefined
        ? await principalFromSession(authenticator, c)
        : await principalFromDeviceToken(authenticator, header);
    if (principal === null) return failureCodeResponse(c, "invalid_token");
    c.set("principal", principal);
    return next();
  };

const handlerRouteKey = (c: Context): string | undefined => {
  const handler = matchedRoutes(c).findLast((route) => route.method !== "ALL");
  return handler === undefined ? undefined : `${handler.method} ${handler.path}`;
};

export const authorize: MiddlewareHandler<AppEnv> = async (c, next) => {
  const route = handlerRouteKey(c);
  if (route === undefined) return next();
  const verdict = judgeAccess(c.get("principal"), route);
  if (verdict === "allow") return next();
  return failureCodeResponse(c, verdict);
};
