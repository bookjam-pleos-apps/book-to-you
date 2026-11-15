import type { ReactNode } from "react";

type FormProps = { readonly onSubmit: () => void; readonly children: ReactNode };

// 키보드의 이동·완료 키로도 제출되게 화면 내용을 form으로 감싼다. 아래 버튼(Dock)은 type="submit"으로 둔다.
// 제출 버튼이 꺼져 있으면 브라우저가 키보드 제출도 막는다.
export const Form = ({ onSubmit, children }: FormProps) => (
  <form
    className="flex flex-1 flex-col gap-4"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {children}
  </form>
);
