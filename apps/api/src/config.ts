import { MAX_SCRIPT_ERROR_RATE } from "@voice-storybook/shared/qc";
import { z } from "zod";

import { DAY_MS, HOUR_MS } from "./domain/identity/otp-limits";

// .env에 값 없이 두어도 설정하지 않은 것으로 본다.
const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

const DEMO_PAIRING_KEYS = ["DEMO_PAIRING_CODE", "DEMO_USER_ID", "DEMO_PAIRING_UNTIL"] as const;

const setsDemoPairingAllOrNothing = (env: Record<string, unknown>): boolean => {
  const configured = DEMO_PAIRING_KEYS.filter((key) => env[key] !== undefined).length;
  return configured === 0 || configured === DEMO_PAIRING_KEYS.length;
};

const sharesShelfOnlyWithDemoUser = (env: Record<string, unknown>): boolean =>
  env["DEMO_SHARED_SHELF"] !== "enabled" || env["DEMO_USER_ID"] !== undefined;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  PUBLIC_ORIGIN: z.url(),
  AUTH_SECRET: z.string().min(32),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(1),
  CONTENT_DIR: z.string().min(1).default("../../content"),
  TRUST_PROXY: z.stringbool().default(false),
  // 시연 서버처럼 부모 로그인이 필요 없는 배포는 메일 없이 로그인을 끈다.
  LOGIN_MODE: z.enum(["otp", "disabled"]).default("otp"),
  // 차 QR로 이메일 없이 계정을 만드는 바로 시작하기. 코드는 공개 API로도 받을 수 있어 누구나 계정을 만들 수 있으므로 기본은 끈다.
  QUICK_START: z.enum(["enabled", "disabled"]).default("disabled"),
  // 심사자용 데모 코드 페어링. 셋을 함께 설정해야 켜진다.
  DEMO_PAIRING_CODE: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  DEMO_USER_ID: z.preprocess(emptyToUndefined, z.uuid().optional()),
  DEMO_PAIRING_UNTIL: z.preprocess(emptyToUndefined, z.iso.datetime({ offset: true }).optional()),
  // 시연 서버 전용. 다른 계정의 차량 책장에 데모 계정의 게시된 동화를 함께 내려준다.
  DEMO_SHARED_SHELF: z.preprocess(emptyToUndefined, z.enum(["enabled", "disabled"]).default("disabled")),
  TERMS_VERSION: z.string().min(1).default("2026-11"),
  AI_NOTICE_VERSION: z.string().min(1).default("2026-11"),
  COMPOSE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
}).refine(setsDemoPairingAllOrNothing, {
  message: `${DEMO_PAIRING_KEYS.join(", ")}은 함께 설정한다`,
  path: ["DEMO_PAIRING_CODE"],
}).refine(sharesShelfOnlyWithDemoUser, {
  message: "DEMO_SHARED_SHELF=enabled는 DEMO_USER_ID가 필요하다",
  path: ["DEMO_SHARED_SHELF"],
});

export type Env = z.infer<typeof envSchema>;

export const POLICY = {
  otp: {
    ttlMs: 10 * 60_000,
    limits: { requestsPerHour: 5, failuresPerDay: 20 },
    ipHitsPerHour: 30,
    ipWindowMs: HOUR_MS,
  },
  sessionTtlMs: 30 * DAY_MS,
  // 이메일 없는 계정은 세션이 끝나면 다시 들어올 길이 없어 길게 둔다.
  quickStartSessionTtlMs: 365 * DAY_MS,
  maxOfflineSeconds: 604_800,
  upload: {
    maxBytes: 25 * 1024 * 1024,
    ffmpeg: { timeoutMs: 30_000, concurrency: 2, maxInputSec: 30 },
  },
  duration: {
    clip: { minMs: 10_000, maxMs: 20_000 },
    consent: { minMs: 3_000, maxMs: 20_000 },
    prompt: { minMs: 2_000, maxMs: 8_000 },
  },
  // 잠정값이다. 측정값을 voice_clips.signal에 남기고 폰 측정 후 다시 맞춘다.
  signal: { maxClippedRatio: 0.001, maxNoiseFloorDb: -35, minPeakDb: -30 },
  consentPhraseTtlMs: 10 * 60_000,
  verify: { maxErrorRate: MAX_SCRIPT_ERROR_RATE, timeoutMs: 60_000 },
  // 부모가 요청해 아직 끝나지 않은 렌더(대기 + 진행)의 상한이다. 렌더 워커가 한 편씩 돌리는 GPU 대기열을 지킨다.
  renderRequest: { maxPendingPerUser: 3 },
  batchRender: {
    engineId: "qwen3-base",
    model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    // style별 참조 혼합으로 바꿨다. 이전 calm 전용 렌더와 렌더 키가 겹치지 않게 올린다.
    assemblyVersion: "mixed-batch-1",
    seed: 1234,
    // 녹음이 있어도 다른 참조로 읽을 style만 적는다. soft도 soft 녹음으로 읽어 비어 있다.
    // 여기를 바꿔도 assemblyVersion은 그대로 둔다. 쓰는 녹음이 달라지면 refClipIds가 바뀌어 렌더 키가 따라 바뀐다.
    readAs: {},
    // calm에서만 잰 값이다.
    limits: { maxSyllables: 180, minSyllables: 30 },
    encodeTimeoutMs: 5 * 60_000,
    // 초안 문구다. 법률 검토 전이다.
    aiNotice: "이 음성은 보호자의 동의를 받아 AI로 생성한 합성 음성입니다",
  },
  // 맥 렌더 워커(main-render-worker). 한 번에 한 편만 장비에 맡기고 주기마다 task를 조회한다.
  renderWorker: {
    pollMs: 10_000,
    // DGX redhood 42단위 338초의 약 5배. render-story 셸 단계의 35분 timeout보다 짧다.
    timeoutMs: 30 * 60_000,
    // task가 사라지고 결과도 없을 때 한 번만 다시 낸다.
    maxSubmissions: 2,
    cleanupGraceMs: 3 * 60_000,
    requestTimeoutMs: 15_000,
    transferTimeoutMs: 5 * 60_000,
  },
  orphanGraceMs: DAY_MS,
  otpHistoryMs: DAY_MS,
  pairing: {
    ttlMs: 10 * 60_000,
    intervalMs: 5_000,
    ipHitsPerHour: 30,
    ipWindowMs: HOUR_MS,
  },
} as const;

export const loadEnv = (env: NodeJS.ProcessEnv): Env => envSchema.parse(env);
