import { z } from "zod";

import { REPORT_REASONS } from "../../vocab";

// 차나 부모 웹이 지금 듣는 이야기(렌더)를 신고한다. 응답은 본문 없는 204다.
export const reportRequestSchema = z.object({
  renderId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;
