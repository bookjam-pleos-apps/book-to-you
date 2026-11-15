import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { failureCodeResponse } from "./failure-status";
import type { AppEnv } from "./principal";

export const uploadBodyLimit = (maxBytes: number): MiddlewareHandler<AppEnv> =>
  bodyLimit({ maxSize: maxBytes, onError: (c) => failureCodeResponse(c, "upload_too_large") });
