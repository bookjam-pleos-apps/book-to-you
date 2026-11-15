import type { Context, MiddlewareHandler } from "hono";

import type { Clock } from "../../application/ports/clock";
import { clientAddress, ipRateLimitKey } from "./client-ip";
import { failureCodeResponse } from "./failure-status";
import type { AppEnv } from "./principal";

export type IpRateLimitOptions = {
  readonly limit: number;
  readonly windowMs: number;
  readonly clock: Clock;
  readonly trustProxy: boolean;
  readonly remoteAddress: (c: Context) => string;
  readonly maxTrackedAddresses?: number;
};

type Window = { readonly startedAtMs: number; readonly hits: number };

const MAX_TRACKED_ADDRESSES = 10_000;

const nextWindow = (current: Window | undefined, nowMs: number, windowMs: number): Window =>
  current === undefined || nowMs - current.startedAtMs >= windowMs
    ? { startedAtMs: nowMs, hits: 1 }
    : { ...current, hits: current.hits + 1 };

const forgetExpired = (windows: Map<string, Window>, nowMs: number, windowMs: number): void => {
  [...windows]
    .filter(([, window]) => nowMs - window.startedAtMs >= windowMs)
    .forEach(([key]) => windows.delete(key));
};

// 주소를 바꿔 가며 보내는 요청이 메모리를 채우지 못하게 한다. 가득 차면 가장 오래된 주소를 잊는다.
const makeRoomFor = (windows: Map<string, Window>, key: string, nowMs: number, windowMs: number, maxTracked: number): void => {
  if (windows.has(key) || windows.size < maxTracked) return;
  forgetExpired(windows, nowMs, windowMs);
  if (windows.size < maxTracked) return;
  const [oldest] = windows.keys();
  if (oldest !== undefined) windows.delete(oldest);
};

// API는 프로세스 하나다. 재시작하면 초기화되지만 나머지 세 겹이 DB에 남는다.
export const ipRateLimit = (options: IpRateLimitOptions): MiddlewareHandler<AppEnv> => {
  const windows = new Map<string, Window>();
  return async (c, next) => {
    const nowMs = options.clock().getTime();
    const address = clientAddress(c.req.header("x-forwarded-for"), options.remoteAddress(c), options.trustProxy);
    const key = ipRateLimitKey(address);
    makeRoomFor(windows, key, nowMs, options.windowMs, options.maxTrackedAddresses ?? MAX_TRACKED_ADDRESSES);
    const window = nextWindow(windows.get(key), nowMs, options.windowMs);
    windows.set(key, window);
    return window.hits > options.limit ? failureCodeResponse(c, "too_many_requests") : next();
  };
};
