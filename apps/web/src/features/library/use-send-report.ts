import { reportRequestSchema } from "@voice-storybook/shared/contracts/v1";
import type { ReportReason } from "@voice-storybook/shared/vocab";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { requestNoContent } from "../../shared/api-client/request";
import { reportOutcomeOf, type ReportOutcome } from "./report-outcome";

export type SendReport = {
  readonly send: (reason: ReportReason) => void;
  readonly pending: boolean;
  // 보내기 전과 보내는 중에는 null이다.
  readonly outcome: ReportOutcome | null;
  readonly dismiss: () => void;
};

// 책장에서 빠진 동화(404)였으면 낡은 책장을 다시 받는다.
export const useSendReport = (renderId: string): SendReport => {
  const queryClient = useQueryClient();
  const report = useMutation({
    mutationFn: (reason: ReportReason) => requestNoContent("POST", "/v1/reports", reportRequestSchema.parse({ renderId, reason })),
    onError: (error) => {
      if (reportOutcomeOf(error) === "gone") void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.library });
    },
  });
  const settled = report.isSuccess || report.isError;
  return { send: report.mutate, pending: report.isPending, outcome: settled ? reportOutcomeOf(report.error) : null, dismiss: report.reset };
};
