import type { ReactNode } from "react";

import { cn } from "../lib/utils";

type IconButtonProps = {
  // 아이콘만 있는 버튼이라 화면 낭독기가 읽을 이름이 꼭 필요하다.
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
};

export const IconButton = ({ label, onClick, children, className }: IconButtonProps) => (
  <button type="button" className={cn("grid size-11 shrink-0 place-items-center rounded-full text-ink", className)} aria-label={label} onClick={onClick}>
    {children}
  </button>
);
