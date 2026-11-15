import { failureCode } from "../../shared/api-client/api-error";

const QUICK_START_ERRORS: Record<string, string> = {
  already_signed_in: "이미 로그인돼 있어요. 연결 화면으로 갈게요.",
  invalid_user_code: "차 화면의 코드가 바뀌었어요. 차에 새로 뜬 QR을 다시 찍어 주세요.",
  terms_outdated: "약관이 바뀌었어요. 화면을 새로고침해 주세요.",
  too_many_requests: "시도가 많았어요. 잠시 뒤에 다시 해 주세요.",
};

export const quickStartErrorText = (error: unknown): string =>
  QUICK_START_ERRORS[failureCode(error) ?? ""] ?? "시작하지 못했어요. 잠시 뒤에 다시 해 주세요.";
