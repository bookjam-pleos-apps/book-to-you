import type { ReportReason } from "@voice-storybook/shared/vocab";

export type NewReport = {
  readonly userId: string;
  readonly deviceId: string | null;
  readonly renderId: string;
  readonly storyId: string;
  readonly voiceId: string;
  readonly reason: ReportReason;
};

export interface ReportRepo {
  // 같은 신고가 이미 있으면 아무것도 하지 않는다.
  record(report: NewReport): Promise<void>;
}
