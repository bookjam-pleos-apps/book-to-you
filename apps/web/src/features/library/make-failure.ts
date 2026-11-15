import { failureCode } from "../../shared/api-client/api-error";

// 동화 만들기 요청이 거절된 이유를 부모가 할 일로 바꾼다. 다시 눌러도 안 되는 경우는 버튼을 숨긴다.
export type MakeFailure = { readonly body: string; readonly retryable: boolean };

const BY_CODE: Record<string, MakeFailure> = {
  too_many_pending: { body: "만드는 중인 동화가 끝나면 다시 눌러 주세요.", retryable: true },
  no_passed_clip: { body: "이 목소리 녹음을 다시 해 주세요. 목소리 화면에서 고칠 수 있어요.", retryable: false },
  ambiguous_clip: { body: "지금은 이 목소리로 만들 수 없어요.", retryable: false },
  unrenderable_line: { body: "이 동화는 지금 만들 수 없어요.", retryable: false },
  unknown_script: { body: "이 동화는 지금 만들 수 없어요.", retryable: false },
  no_active_consent: { body: "목소리 확인이 끝나면 만들 수 있어요.", retryable: false },
  not_found: { body: "동화나 목소리를 찾지 못했어요.", retryable: false },
};

const TRY_LATER: MakeFailure = { body: "잠시 뒤에 다시 해 주세요.", retryable: true };

// 상태 코드가 아니라 오류 코드로 고른다. 같은 403이라도 csrf 거절은 동의와 관계없다.
export const makeFailureOf = (error: unknown): MakeFailure => BY_CODE[failureCode(error) ?? ""] ?? TRY_LATER;
