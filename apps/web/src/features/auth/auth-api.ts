import { authOptionsResponseSchema, meResponseSchema, type MeResponse } from "@voice-storybook/shared/contracts/v1";
import { useQuery } from "@tanstack/react-query";

import { failureStatus } from "../../shared/api-client/api-error";
import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { requestJson, requestNoContent } from "../../shared/api-client/request";
import type { Terms } from "../../shared/api-client/terms";

export const requestOtp = (email: string): Promise<void> => requestNoContent("POST", "/v1/auth/otp/request", { email });

export const verifyOtp = (email: string, code: string, terms: Terms): Promise<MeResponse> =>
  requestJson("POST", "/v1/auth/otp/verify", meResponseSchema, { email, code, ...terms });

// 차 QR로 들어온 로그인 전 휴대폰이 이메일 없이 계정을 만들고 그 차를 잇는다. 성공하면 로그인 쿠키가 온다.
export const quickStart = (userCode: string, terms: Terms): Promise<MeResponse> =>
  requestJson("POST", "/v1/devices/pair/quick-start", meResponseSchema, { userCode, ...terms });

export const logout = (): Promise<void> => requestNoContent("POST", "/v1/auth/logout");

// 로그인하지 않은 상태는 오류가 아니라 값(null)이다.
const fetchSession = async (): Promise<MeResponse | null> => {
  try {
    return await requestJson("GET", "/v1/me", meResponseSchema);
  } catch (error) {
    if (failureStatus(error) === 401) return null;
    throw error;
  }
};

export const useSession = () => useQuery({ queryKey: QUERY_KEYS.me, queryFn: fetchSession, staleTime: 60_000 });

// 배포마다 정해져 바뀌지 않는다.
export const useAuthOptions = () =>
  useQuery({
    queryKey: QUERY_KEYS.authOptions,
    queryFn: () => requestJson("GET", "/v1/auth/options", authOptionsResponseSchema),
    staleTime: Infinity,
  });

export const deleteAccount = (): Promise<void> => requestNoContent("DELETE", "/v1/me");
