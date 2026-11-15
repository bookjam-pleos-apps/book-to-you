import { normalizeUserCode } from "../../domain/devices/user-code";
import { isCurrentTerms } from "../../domain/terms";
import { issueSession, type SessionRepo } from "../identity";
import type { Clock } from "../ports/clock";
import type { QuickStartRepo } from "./ports";

export type QuickStartDeps = {
  readonly quickStarts: QuickStartRepo;
  readonly sessions: SessionRepo;
  readonly clock: Clock;
  readonly sessionTtlMs: number;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
  readonly newAccountEmail: () => string;
};

export type QuickStartInput = {
  readonly userCode: string;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
};

export type QuickStartResult =
  | {
      readonly kind: "ok";
      readonly userId: string;
      readonly email: string;
      readonly sessionToken: string;
      readonly maxAgeSec: number;
    }
  | { readonly kind: "terms_outdated" | "invalid_user_code" };

// 살아 있는 연결 코드가 있어야 계정이 생기고, 그 코드에 차가 바로 붙는다.
// 코드는 공개 API(pair/start)로도 받을 수 있어 이메일 확인을 대신하지는 못한다. 그래서 배포 설정(QUICK_START)으로만 켠다.
export const quickStart =
  (deps: QuickStartDeps) =>
  async (input: QuickStartInput): Promise<QuickStartResult> => {
    if (!isCurrentTerms(deps, input)) return { kind: "terms_outdated" };
    const now = deps.clock();
    const email = deps.newAccountEmail();
    const userCode = normalizeUserCode(input.userCode);
    const userId = await deps.quickStarts.registerAndConfirm({ ...input, userCode, email, now });
    if (userId === null) return { kind: "invalid_user_code" };
    return { kind: "ok", userId, email, ...(await issueSession(deps, userId, now)) };
  };
