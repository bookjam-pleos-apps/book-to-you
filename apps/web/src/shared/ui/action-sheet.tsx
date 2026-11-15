import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";

import { cn } from "../lib/utils";

export type SheetAction = {
  readonly label: string;
  readonly onSelect: () => void;
  // danger는 되돌릴 수 없는 동작(지우기)이다. 맨 아래 빨간 글자로 둔다.
  readonly tone?: "default" | "danger";
};

type ActionSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  // 항목만 봐서는 무엇을 고르는지 모를 때 제목을 보인다. 기본은 화면 낭독기만 읽는다.
  readonly showTitle?: boolean;
  readonly actions: readonly SheetAction[];
};

const ActionItem = ({ action, onPick }: { readonly action: SheetAction; readonly onPick: (action: SheetAction) => void }) => (
  <li>
    <button
      type="button"
      className={cn("flex min-h-13 w-full items-center text-left text-label font-bold", action.tone === "danger" ? "text-danger-text" : "text-ink")}
      onClick={() => onPick(action)}
    >
      {action.label}
    </button>
  </li>
);

// 고른 동작은 시트가 다 닫힌 뒤에 실행한다. 다른 대화상자를 여는 동작이 시트의 포커스 되돌리기와 겹치지 않게 한다.
const useRunAfterClose = (onClose: () => void) => {
  const [picked, setPicked] = useState<SheetAction | null>(null);
  const pick = (action: SheetAction) => {
    setPicked(action);
    onClose();
  };
  const onCloseComplete = (nowOpen: boolean) => {
    if (nowOpen || picked === null) return;
    setPicked(null);
    picked.onSelect();
  };
  return { pick, onCloseComplete };
};

// 자주 쓰지 않는 동작을 모아 두는 아래 시트다. 화면에는 ⋯ 버튼 하나만 남긴다.
export const ActionSheet = ({ open, onClose, title, showTitle = false, actions }: ActionSheetProps) => {
  const { pick, onCloseComplete } = useRunAfterClose(onClose);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())} onOpenChangeComplete={onCloseComplete}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-ink/40" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-screen-phone rounded-t-alert bg-surface px-6 pt-3 pb-7">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-fill-strong" aria-hidden="true" />
          <Dialog.Title className={showTitle ? "pt-2 pb-1 text-caption text-ink-3" : "sr-only"}>{title}</Dialog.Title>
          <ul className="divide-y divide-line">
            {actions.map((action) => <ActionItem key={action.label} action={action} onPick={pick} />)}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
