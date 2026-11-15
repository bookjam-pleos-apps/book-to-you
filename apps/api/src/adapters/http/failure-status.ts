import type { Context } from "hono";

import { errorResponse } from "./errors";

// 웹은 오류 코드로 안내 문구를 고른다. 같은 코드가 경로마다 다른 상태로 나가지 않게 한곳에 둔다.
export const FAILURE_STATUS = {
  invalid_request: 400,
  invalid_phrase: 400,
  invalid_code: 400,
  invalid_demo_code: 400,
  terms_outdated: 400,
  unknown_script: 400,
  unauthenticated: 401,
  invalid_token: 401,
  forbidden: 403,
  no_active_consent: 403,
  not_found: 404,
  invalid_user_code: 404,
  already_live: 409,
  already_signed_in: 409,
  no_passed_clip: 409,
  ambiguous_clip: 409,
  upload_too_large: 413,
  unreadable: 422,
  unrenderable_line: 422,
  too_many_requests: 429,
  too_many_attempts: 429,
  too_many_pending: 429,
  internal_error: 500,
  login_disabled: 503,
  demo_not_ready: 503,
} as const;

export type FailureCode = keyof typeof FAILURE_STATUS;

export const failureCodeResponse = (c: Context, code: FailureCode): Response => errorResponse(c, FAILURE_STATUS[code], code);
