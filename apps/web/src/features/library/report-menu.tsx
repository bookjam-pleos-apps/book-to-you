import type { Render } from "@voice-storybook/shared/contracts/v1";
import { useState } from "react";

import { ActionSheet, type SheetAction } from "../../shared/ui/action-sheet";
import { IconButton } from "../../shared/ui/icon-button";
import { MoreIcon } from "../../shared/ui/icons";
import { NoticeDialog } from "../../shared/ui/notice-dialog";
import { REPORT_TITLE, reportItemsOf, type ReportItem } from "./report-menu-choices";
import { outcomeTextOf } from "./report-outcome";
import { useSendReport } from "./use-send-report";

// 듣다가 이상한 점을 알리는 ⋯다. 사유를 바로 고르게 해 한 번 덜 누른다.
export const ReportMenu = ({ render }: { readonly render: Render }) => {
  const report = useSendReport(render.renderId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sentFeedback, setSentFeedback] = useState(false);
  const items = reportItemsOf(render);
  if (items.length === 0) return null;
  const send = (item: ReportItem) => {
    setSentFeedback(item.feedback);
    report.send(item.reason);
  };
  const actions: readonly SheetAction[] = items.map((item) => ({ label: item.label, onSelect: () => send(item) }));
  // 보내는 중에는 다시 열지 않는다. 같은 신고를 겹쳐 보내지 않는다.
  const openSheet = () => (report.pending ? undefined : setSheetOpen(true));
  return (
    <>
      <IconButton label="문제 알리기" onClick={openSheet}>
        <MoreIcon className="size-6" />
      </IconButton>
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={REPORT_TITLE} showTitle actions={actions} />
      {report.outcome === null ? null : <NoticeDialog open {...outcomeTextOf(report.outcome, sentFeedback)} onClose={report.dismiss} />}
    </>
  );
};
