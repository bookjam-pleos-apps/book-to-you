// 로그인 진행 단계. 단계는 주소(/login, /login/email, /login/code)에 두어 새로고침과 뒤로 가기를 따른다.
// 이메일과 약관 동의는 개인정보·흐름 정보라 주소가 아니라 history state에 둔다(새로고침해도 남는다).
export type LoginStage = { readonly kind: "terms" } | { readonly kind: "email" } | { readonly kind: "code"; readonly email: string };

export type LoginHistoryState = { readonly agreed: true; readonly email?: string };

const STAGE_PATHS = { terms: "/login", email: "/login/email", code: "/login/code" } as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const readHistoryState = (value: unknown): LoginHistoryState | null => {
  if (!isRecord(value) || value["agreed"] !== true) return null;
  const email = value["email"];
  return typeof email === "string" && email !== "" ? { agreed: true, email } : { agreed: true };
};

// 앞 단계를 거치지 않고 들어오면(약관 동의 없음, 이메일 없음) 갈 수 있는 가장 앞 단계로 돌린다.
export const stageOf = (step: string | undefined, historyState: unknown): LoginStage => {
  const state = readHistoryState(historyState);
  if (state === null || step === undefined) return { kind: "terms" };
  if (step === "code" && state.email !== undefined) return { kind: "code", email: state.email };
  return { kind: "email" };
};

export const pathOf = (stage: LoginStage): string => STAGE_PATHS[stage.kind];

export const historyStateOf = (stage: LoginStage): LoginHistoryState | null => {
  if (stage.kind === "terms") return null;
  return stage.kind === "code" ? { agreed: true, email: stage.email } : { agreed: true };
};

export const previousStage = (stage: LoginStage): LoginStage | null => {
  if (stage.kind === "code") return { kind: "email" };
  if (stage.kind === "email") return { kind: "terms" };
  return null;
};
