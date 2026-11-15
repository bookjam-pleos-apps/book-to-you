import type { ReportReason } from "@voice-storybook/shared/vocab";

import type { LibraryRepo } from "../library/ports";
import type { ReportRepo } from "./ports";

export type SubmitReportDeps = {
  readonly reports: ReportRepo;
  readonly library: LibraryRepo;
};

export type SubmitReportInput = {
  readonly userId: string;
  readonly deviceId: string | null;
  readonly renderId: string;
  readonly reason: ReportReason;
};

export type SubmitReportResult = { readonly kind: "recorded" } | { readonly kind: "not_found" };

// 내 책장에 보이는 이야기만 신고할 수 있다. 시연 서버의 공유 책장도 책장 조회가 이미 합쳐 준다.
export const submitReport =
  ({ reports, library }: SubmitReportDeps) =>
  async ({ userId, deviceId, renderId, reason }: SubmitReportInput): Promise<SubmitReportResult> => {
    const render = await library.findShelfRender(renderId, userId);
    if (render === null) return { kind: "not_found" };
    await reports.record({ userId, deviceId, renderId, storyId: render.storyId, voiceId: render.voiceId, reason });
    return { kind: "recorded" };
  };
