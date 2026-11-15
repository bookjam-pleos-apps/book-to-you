import { AlertDialog } from "@base-ui/react/alert-dialog";

import { Button } from "./button";
import { CENTER_POPUP, DIALOG_BACKDROP } from "./dialog-styles";

type ConfirmDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly pending?: boolean;
  // 확인했는데 실패한 이유다. 대화상자 뒤에 띄우면 어두운 배경에 가려 보이지 않는다.
  readonly error?: string | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
};

// 되돌릴 수 없는 동작(지우기) 앞에 띄운다. 확인 버튼은 danger만 쓴다.
export const ConfirmDialog = ({ open, title, body, confirmLabel, pending = false, error = null, onConfirm, onClose }: ConfirmDialogProps) => (
  <AlertDialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
    <AlertDialog.Portal>
      <AlertDialog.Backdrop className={DIALOG_BACKDROP} />
      <AlertDialog.Popup className={CENTER_POPUP}>
        <AlertDialog.Title className="text-label font-bold">{title}</AlertDialog.Title>
        <AlertDialog.Description className="text-base/6 text-ink-2">{body}</AlertDialog.Description>
        {error === null ? null : <p role="alert" className="text-caption text-danger-text">{error}</p>}
        <div className="mt-2 flex gap-2.5">
          <Button variant="ghost" className="flex-1" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" className="flex-1" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </AlertDialog.Popup>
    </AlertDialog.Portal>
  </AlertDialog.Root>
);
