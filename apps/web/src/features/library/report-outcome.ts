import { failureStatus } from "../../shared/api-client/api-error";

export type ReportOutcome = "sent" | "gone" | "failed";

// 404는 그 사이 책장에서 빠진 동화다. 다시 눌러도 보낼 수 없어 따로 알린다.
export const reportOutcomeOf = (error: unknown): ReportOutcome => {
  if (error === null) return "sent";
  return failureStatus(error) === 404 ? "gone" : "failed";
};

// 내 목소리 같지 않다고 알린 것은 신고가 아니라 "신고했어요"라고 하지 않는다.
export const FEEDBACK_SENT_TEXT = { title: "전달했어요", body: "알려 주셔서 고마워요. 더 닮게 만들도록 확인해 볼게요." } as const;

export const outcomeTextOf = (outcome: ReportOutcome, feedback: boolean): { readonly title: string; readonly body: string } =>
  outcome === "sent" && feedback ? FEEDBACK_SENT_TEXT : OUTCOME_TEXT[outcome];

const OUTCOME_TEXT: Readonly<Record<ReportOutcome, { readonly title: string; readonly body: string }>> = {
  sent: { title: "신고했어요", body: "알려 주셔서 고마워요. 확인해 볼게요." },
  gone: { title: "신고할 수 없는 동화예요", body: "이 동화는 책장에서 빠졌어요." },
  failed: { title: "지금은 보낼 수 없어요", body: "연결을 확인하고 다시 눌러 주세요." },
};
