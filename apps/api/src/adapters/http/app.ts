import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";

import { authenticate, authorize, type Authenticator } from "./authenticate";
import { errorResponse } from "./errors";
import { failureCodeResponse } from "./failure-status";
import type { AppEnv } from "./principal";

export type HttpDeps = {
  readonly publicOrigin: string;
  readonly authenticator: Authenticator;
};

export type RouteRegistrar = (app: Hono<AppEnv>) => void;

export const createApp = (deps: HttpDeps, registrars: readonly RouteRegistrar[] = []): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use(csrf({ origin: deps.publicOrigin }));
  app.use(authenticate(deps.authenticator));
  app.use(authorize);
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  registrars.forEach((register) => register(app));
  app.notFound((c) => failureCodeResponse(c, "not_found"));
  app.onError((error, c) => {
    if (error instanceof HTTPException) return errorResponse(c, error.status, "request_rejected");
    console.error(error);
    return failureCodeResponse(c, "internal_error");
  });
  return app;
};
