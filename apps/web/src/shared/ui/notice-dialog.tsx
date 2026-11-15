import { Dialog } from "@base-ui/react/dialog";

import { Button } from "./button";
import { CENTER_POPUP, DIALOG_BACKDROP } from "./dialog-styles";

type NoticeDialogProps = { readonly open: boolean; readonly title: string; readonly body: string; readonly onClose: () => void };

// 한 번 읽고 닫는 알림이다. 고를 것이 없어 버튼은 확인 하나다.
export const NoticeDialog = ({ open, title, body, onClose }: NoticeDialogProps) => (
  <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
    <Dialog.Portal>
      <Dialog.Backdrop className={DIALOG_BACKDROP} />
      <Dialog.Popup className={CENTER_POPUP}>
        <Dialog.Title className="text-label font-bold">{title}</Dialog.Title>
        <Dialog.Description className="text-base/6 text-ink-2">{body}</Dialog.Description>
        <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
          확인
        </Button>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
