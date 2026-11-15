import { z } from "zod";

// 같은 메일함이 대소문자로 나뉘면 이메일별 시도 제한을 우회하고 계정도 갈라진다.
const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const otpRequestSchema = z.object({
  email: emailField,
});

export const otpVerifyRequestSchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/),
  termsVersion: z.string().min(1),
  aiNoticeVersion: z.string().min(1),
});

export const termsResponseSchema = z.object({
  termsVersion: z.string().min(1),
  aiNoticeVersion: z.string().min(1),
});

export const meResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  // 차 QR로 이메일 없이 시작한 계정이다. 로그아웃하면 다시 들어올 길이 없다.
  emailless: z.boolean(),
});

// 배포마다 켜진 계정 시작 방법이다. 화면이 막힌 길을 보이지 않게 한다.
export const authOptionsResponseSchema = z.object({
  emailLogin: z.boolean(),
  quickStart: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
