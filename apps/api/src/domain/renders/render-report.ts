import type { StoryLine } from "../stories/story-version";

export type ReportLine = {
  readonly text: string;
  readonly passed: boolean;
};

export type ReportProblem = "script_mismatch" | "sentence_qc_failed";

const joinedText = (lines: readonly { readonly text: string }[]): string => lines.map(({ text }) => text).join(" ");

// 묶음은 문장을 공백 하나로 잇는다. 같은 글이 아니면 다른 이야기나 잘린 렌더를 게시하는 것이다.
export const judgeRenderReport = (story: readonly StoryLine[], report: readonly ReportLine[]): ReportProblem | null => {
  if (report.length === 0 || joinedText(story) !== joinedText(report)) return "script_mismatch";
  return report.every(({ passed }) => passed) ? null : "sentence_qc_failed";
};
