import { useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { TextLink } from "./controls";

const DELETE_FAILED = "지우지 못했어요. 잠시 뒤에 다시 해 주세요.";

// 지우기 요청의 상태다. TanStack Query의 mutation 결과를 그대로 넘기면 된다.
type DeleteRequest = {
  readonly mutate: () => void;
  readonly reset: () => void;
  readonly isPending: boolean;
  readonly isError: boolean;
};

type DeleteText = { readonly title: string; readonly body: string };

type DeleteDialogProps = DeleteText & { readonly open: boolean; readonly onClose: () => void; readonly remove: DeleteRequest };

// 지우기 확인 대화상자다. 실패는 대화상자 안에 알리고, 닫으면 실패를 지운다.
export const DeleteDialog = ({ open, onClose, title, body, remove }: DeleteDialogProps) => {
  const close = () => {
    onClose();
    remove.reset();
  };
  return (
    <ConfirmDialog open={open} title={title} body={body} confirmLabel="지우기" pending={remove.isPending}
      error={remove.isError ? DELETE_FAILED : null} onConfirm={() => remove.mutate()} onClose={close} />
  );
};

type ConfirmDeleteProps = DeleteText & { readonly label: string; readonly remove: DeleteRequest };

// 되돌릴 수 없는 지우기 링크와 확인 대화상자다. 자주 쓰지 않으니 화면 맨 아래 빨간 글자로만 둔다.
export const ConfirmDelete = ({ label, title, body, remove }: ConfirmDeleteProps) => {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <TextLink tone="danger" onClick={() => setAsking(true)}>
        {label}
      </TextLink>
      <DeleteDialog open={asking} onClose={() => setAsking(false)} title={title} body={body} remove={remove} />
    </>
  );
};
