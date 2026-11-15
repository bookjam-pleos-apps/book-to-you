import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import { cn } from "../../../shared/lib/utils";
import { CheckIcon } from "../../../shared/ui/icons";
import { Card } from "../../../shared/ui/surfaces";
import { consentRowOf, voiceRows, type StatusRow } from "./voice-rows";

// 통과한 줄은 글 대신 ✓만 보인다. 화면 낭독에는 "통과"로 읽힌다.
const RowStatus = ({ row }: { readonly row: StatusRow }) => {
  if (row.passed) {
    return (
      <>
        <CheckIcon className="size-5 shrink-0 text-ink" />
        <span className="sr-only">통과</span>
      </>
    );
  }
  return <span className={cn("text-caption", row.tone === "danger" ? "font-bold text-danger-text" : "text-ink-3")}>{row.status}</span>;
};

const Row = ({ row }: { readonly row: StatusRow }) => (
  <li className="flex min-h-12 items-center justify-between gap-3 py-2">
    <span className="text-label font-bold">{row.title}</span>
    <RowStatus row={row} />
  </li>
);

// 녹음 상태만 보이는 목록이다. 녹음은 화면 아래 "이어서 녹음하기"가 순서대로 이끈다.
export const VoiceStatusRows = ({ voice }: { readonly voice: VoiceResponse }) => (
  <Card className="gap-0 py-1">
    <ul className="divide-y divide-line">
      <Row row={consentRowOf(voice)} />
      {voiceRows(voice).map((row) => <Row key={row.style} row={row} />)}
    </ul>
  </Card>
);
