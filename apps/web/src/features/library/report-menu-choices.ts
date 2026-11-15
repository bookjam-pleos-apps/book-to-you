import type { Render } from "@voice-storybook/shared/contracts/v1";
import { REPORT_REASONS, type ReportReason } from "@voice-storybook/shared/vocab";

export const REPORT_TITLE = "어떤 문제가 있나요?";

const REASON_LABEL: Readonly<Record<ReportReason, string>> = {
  voice: "목소리가 이상해요",
  content: "내용이 부적절해요",
};

// 내 동화의 목소리는 부모가 직접 녹음한 것이라 "신고"가 아니다. 만들어진 소리가 내 목소리 같지 않다고 알려 주는 것이다.
const OWN_VOICE_LABEL = "내 목소리 같지 않아요";

export type ReportItem = { readonly reason: ReportReason; readonly label: string; readonly feedback: boolean };

type Reportable = Pick<Render, "status" | "shared">;

const itemOf = (render: Reportable, reason: ReportReason): ReportItem => {
  const feedback = reason === "voice" && !render.shared;
  return { reason, label: feedback ? OWN_VOICE_LABEL : REASON_LABEL[reason], feedback };
};

// 들을 수 있는 동화만 알릴 수 있다. 서버에는 예시 동화와 내 동화 모두 같은 두 사유로 간다.
// 내 목소리를 다시 녹음해 고치는 길은 서버가 통과 녹음 둘을 다루지 못해(ambiguous_clip) 아직 열지 않는다.
export const reportItemsOf = (render: Reportable): readonly ReportItem[] =>
  render.status === "playable" ? REPORT_REASONS.map((reason) => itemOf(render, reason)) : [];
