import type { Principal } from "./principal";

// 표에 없는 경로는 기본 거부다. 새 경로를 공개하거나 기기에 열려면 여기에 적어야 한다.
const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  "GET /healthz",
  "GET /v1/terms",
  "GET /v1/auth/options",
  "POST /v1/auth/otp/request",
  "POST /v1/auth/otp/verify",
  "POST /v1/devices/pair/start",
  "POST /v1/devices/pair/demo",
  "POST /v1/devices/pair/quick-start",
  "POST /v1/devices/pair/token",
]);
const DEVICE_ROUTES: ReadonlySet<string> = new Set(["GET /v1/library/manifest", "GET /v1/audio/:id", "POST /v1/reports"]);

export type AccessVerdict = "allow" | "unauthenticated" | "forbidden";

export const judgeAccess = (principal: Principal, route: string): AccessVerdict => {
  if (principal.kind === "session") return "allow";
  if (principal.kind === "device") return DEVICE_ROUTES.has(route) ? "allow" : "forbidden";
  return PUBLIC_ROUTES.has(route) ? "allow" : "unauthenticated";
};

export const publicRoutes = (): readonly string[] => [...PUBLIC_ROUTES];

export const deviceRoutes = (): readonly string[] => [...DEVICE_ROUTES];
