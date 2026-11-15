import { z } from "zod";

export const pairStartRequestSchema = z.object({
  deviceName: z.string().min(1).max(64),
});

export const pairStartResponseSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.string().min(1),
  expiresInSec: z.number().int().positive(),
  intervalSec: z.number().int().positive(),
});

export const pairConfirmRequestSchema = z.object({
  userCode: z.string().min(1),
});

// 로그인하지 않은 휴대폰이 차 QR로 들어오면 이메일 없이 계정을 만들고 그 차를 잇는다. 응답은 meResponseSchema다.
export const pairQuickStartRequestSchema = z.object({
  userCode: z.string().min(1),
  termsVersion: z.string().min(1),
  aiNoticeVersion: z.string().min(1),
});

// 심사자용 데모 코드 페어링. 응답은 pairTokenResponseSchema와 같다. 코드를 설정한 시연 서버에만 있다.
export const pairDemoRequestSchema = z.object({
  deviceName: z.string().min(1).max(64),
  demoCode: z.string().min(1).max(128),
});

export const pairTokenRequestSchema = z.object({
  deviceCode: z.string().min(1),
});

export const pairTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
});

// RFC 8628 3.5의 오류 코드를 그대로 쓴다.
export const pairTokenErrorSchema = z.object({
  error: z.enum(["authorization_pending", "slow_down", "expired_token", "invalid_grant"]),
});

export const deviceListResponseSchema = z.object({
  devices: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      lastSeenAt: z.iso.datetime().nullable(),
    }),
  ),
});

export type PairStartResponse = z.infer<typeof pairStartResponseSchema>;
export type PairTokenError = z.infer<typeof pairTokenErrorSchema>;
