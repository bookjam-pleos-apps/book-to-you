import {
  deviceListResponseSchema,
  pairConfirmRequestSchema,
  pairDemoRequestSchema,
  pairQuickStartRequestSchema,
  pairStartRequestSchema,
  pairStartResponseSchema,
  pairTokenRequestSchema,
  pairTokenResponseSchema,
  type PairTokenError,
} from "@voice-storybook/shared/contracts/v1";
import type { Hono, MiddlewareHandler } from "hono";

import type {
  DemoPairingResult,
  DeviceSummary,
  PollResult,
  QuickStartInput,
  QuickStartResult,
  StartedPairing,
} from "../../../application/devices";
import { readJson } from "../errors";
import { failureCodeResponse } from "../failure-status";
import { toMeResponse } from "../me-response";
import { requireSessionUser, type AppEnv } from "../principal";
import { writeSessionCookie } from "../session-cookie";
import { isUuid } from "../uuid-param";

export type DeviceRouteDeps = {
  readonly startPairing: (deviceName: string) => Promise<StartedPairing>;
  readonly confirmPairing: (userCode: string, userId: string) => Promise<boolean>;
  // null이면 바로 시작하기를 켜지 않은 배포다. 경로를 등록하지 않아 없는 경로와 같은 404가 된다.
  readonly quickStart: QuickStartRoute | null;
  readonly pollPairing: (deviceCode: string) => Promise<PollResult>;
  readonly listDevices: (userId: string) => Promise<readonly DeviceSummary[]>;
  readonly revokeDevice: (deviceId: string, userId: string) => Promise<boolean>;
  readonly verificationUri: string;
  readonly pairStartIpLimit: MiddlewareHandler<AppEnv>;
  // null이면 데모 코드를 설정하지 않은 배포다. 경로를 등록하지 않아 다른 없는 경로와 같은 404가 된다.
  readonly redeemDemoCode: RedeemDemoCode | null;
};

type QuickStartRoute = {
  readonly start: (input: QuickStartInput) => Promise<QuickStartResult>;
  // 코드 맞히기 시도가 차의 페어링 시작 한도를 먹지 않게 따로 센다.
  readonly ipLimit: MiddlewareHandler<AppEnv>;
};

type RedeemDemoCode = (demoCode: string, deviceName: string) => Promise<DemoPairingResult>;

const registerDemoPairingRoute = (app: Hono<AppEnv>, redeem: RedeemDemoCode, ipLimit: MiddlewareHandler<AppEnv>): void => {
  app.post("/v1/devices/pair/demo", ipLimit, async (c) => {
    const body = await readJson(c, pairDemoRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const result = await redeem(body.demoCode, body.deviceName);
    if (result.kind !== "token") return failureCodeResponse(c, result.kind);
    return c.json(pairTokenResponseSchema.parse({ accessToken: result.accessToken, tokenType: "Bearer" }));
  });
};

// 로그인 없이 부를 수 있다. 이미 로그인한 휴대폰이 부르면 그 쿠키를 새 계정으로 덮어쓰지 않게 거부한다.
const registerQuickStartRoute = (app: Hono<AppEnv>, { start, ipLimit }: QuickStartRoute): void => {
  app.post("/v1/devices/pair/quick-start", ipLimit, async (c) => {
    if (c.get("principal").kind === "session") return failureCodeResponse(c, "already_signed_in");
    const body = await readJson(c, pairQuickStartRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const result = await start(body);
    if (result.kind !== "ok") return failureCodeResponse(c, result.kind);
    writeSessionCookie(c, result.sessionToken, result.maxAgeSec);
    return c.json(toMeResponse({ id: result.userId, email: result.email }));
  });
};

const registerPairingRoutes = (app: Hono<AppEnv>, deps: DeviceRouteDeps): void => {
  app.post("/v1/devices/pair/start", deps.pairStartIpLimit, async (c) => {
    const body = await readJson(c, pairStartRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const started = await deps.startPairing(body.deviceName);
    return c.json(pairStartResponseSchema.parse({ ...started, verificationUri: deps.verificationUri }));
  });
  app.post("/v1/devices/pair/confirm", async (c) => {
    const body = await readJson(c, pairConfirmRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const confirmed = await deps.confirmPairing(body.userCode, requireSessionUser(c.get("principal")));
    return confirmed ? c.body(null, 204) : failureCodeResponse(c, "invalid_user_code");
  });
  app.post("/v1/devices/pair/token", async (c) => {
    const body = await readJson(c, pairTokenRequestSchema);
    if (body === null) return failureCodeResponse(c, "invalid_request");
    const result = await deps.pollPairing(body.deviceCode);
    if (result.kind === "token") {
      return c.json(pairTokenResponseSchema.parse({ accessToken: result.accessToken, tokenType: "Bearer" }));
    }
    const error: PairTokenError = { error: result.kind };
    return c.json(error, 400);
  });
};

const registerDeviceRoutes = (app: Hono<AppEnv>, deps: DeviceRouteDeps): void => {
  app.get("/v1/devices", async (c) => {
    const devices = await deps.listDevices(requireSessionUser(c.get("principal")));
    const listed = devices.map((device) => ({ ...device, lastSeenAt: device.lastSeenAt?.toISOString() ?? null }));
    return c.json(deviceListResponseSchema.parse({ devices: listed }));
  });
  app.delete("/v1/devices/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return failureCodeResponse(c, "not_found");
    const revoked = await deps.revokeDevice(id, requireSessionUser(c.get("principal")));
    return revoked ? c.body(null, 204) : failureCodeResponse(c, "not_found");
  });
};

export const deviceRoutes =
  (deps: DeviceRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    registerPairingRoutes(app, deps);
    if (deps.quickStart !== null) registerQuickStartRoute(app, deps.quickStart);
    if (deps.redeemDemoCode !== null) registerDemoPairingRoute(app, deps.redeemDemoCode, deps.pairStartIpLimit);
    registerDeviceRoutes(app, deps);
  };
