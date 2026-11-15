import type { VoiceTodo } from "./voice-card-view";

type CheckingTodo = Extract<VoiceTodo, { readonly kind: "checking" }>;

// 홈 선반과 녹음 완료 화면이 같은 말을 쓰도록 여기서만 만든다.
export const remainingRecordingText = (remaining: number): string => `녹음이 ${remaining}개 남았어요`;

// 낭독 확인이 끝나야 감정 녹음을 올릴 수 있다. 그때는 기다린 뒤 녹음이 남았다고 알린다.
export const CHECKING_TEXT: Readonly<Record<CheckingTodo["next"], string>> = {
  record: "낭독을 확인하고 있어요. 끝나면 이어서 녹음할 수 있어요.",
  make: "목소리를 확인하고 있어요. 끝나면 동화를 만들 수 있어요.",
};
