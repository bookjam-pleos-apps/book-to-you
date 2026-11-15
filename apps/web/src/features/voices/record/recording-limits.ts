export type RecordingKind = "consent" | "clip" | "prompt";

export type RecordingLimit = { readonly minMs: number; readonly maxMs: number };

// 서버 POLICY.duration과 같은 값이다. 판정은 서버가 하고, 웹은 안내와 자동 정지에만 쓴다.
const SERVER_LIMITS: Record<RecordingKind, RecordingLimit> = {
  consent: { minMs: 3_000, maxMs: 20_000 },
  clip: { minMs: 10_000, maxMs: 20_000 },
  prompt: { minMs: 2_000, maxMs: 8_000 },
};

// 인코더가 앞뒤에 붙이는 여유 때문에 상한에 딱 맞춰 끊으면 too_long이 날 수 있다.
const STOP_MARGIN_MS = 300;

export const limitFor = (kind: RecordingKind): RecordingLimit => SERVER_LIMITS[kind];

export const autoStopMs = (kind: RecordingKind): number => SERVER_LIMITS[kind].maxMs - STOP_MARGIN_MS;

const seconds = (ms: number): number => Math.round(ms / 1_000);

export const durationHint = (kind: RecordingKind): string =>
  `${seconds(SERVER_LIMITS[kind].minMs)}~${seconds(SERVER_LIMITS[kind].maxMs)}초 동안 읽어 주세요`;

export const isTooShort = (kind: RecordingKind, durationMs: number): boolean => durationMs < SERVER_LIMITS[kind].minMs;
