export type PairEntryChoice = { readonly kind: "confirm" } | { readonly kind: "loading" } | { readonly kind: "quick-start"; readonly code: string };

type PairEntryInput = {
  // undefined는 아직 받는 중, null은 로그인하지 않음이다(useSession과 같다).
  readonly signedIn: boolean | undefined;
  readonly code: string | null;
  readonly quickStart: boolean | undefined;
};

const CONFIRM: PairEntryChoice = { kind: "confirm" };

// 로그인하지 않은 휴대폰이 코드를 들고 왔고 배포가 바로 시작하기를 켰을 때만 바로 시작하기다.
// 설정을 받는 동안 로그인으로 보내면 바로 시작하기를 놓치므로 기다린다. 설정을 못 받으면 지금처럼 로그인이다.
export const choosePairEntry = ({ signedIn, code, quickStart }: PairEntryInput): PairEntryChoice => {
  if (signedIn !== false || code === null) return CONFIRM;
  if (quickStart === undefined) return { kind: "loading" };
  return quickStart ? { kind: "quick-start", code } : CONFIRM;
};
