import { HTTPException } from "hono/http-exception";

export type Principal =
  | { readonly kind: "anonymous" }
  | { readonly kind: "session"; readonly userId: string }
  | { readonly kind: "device"; readonly userId: string; readonly deviceId: string };

export type AppEnv = { Variables: { principal: Principal } };

export const ANONYMOUS: Principal = { kind: "anonymous" };

export const requireSessionUser = (principal: Principal): string => {
  if (principal.kind === "session") return principal.userId;
  throw new HTTPException(403);
};
