import type { ReactNode } from "react";

import { cn } from "../lib/utils";

type ChipProps = { readonly selected: boolean; readonly onClick: () => void; readonly children: ReactNode };

// 고른 칩은 주황 채움 대신 진한 테두리로 보인다. 주황은 "누르면 다음으로 가는" 주 버튼에만 쓴다.
export const Chip = ({ selected, onClick, children }: ChipProps) => (
  <button type="button" aria-pressed={selected} onClick={onClick}
    className={cn(
      "h-12 rounded-full border-2 text-label",
      selected ? "border-ink bg-surface font-bold text-ink" : "border-transparent bg-fill font-semibold text-ink-2",
    )}>
    {children}
  </button>
);

export const ChipGroup = ({ children }: { readonly children: ReactNode }) => <div className="grid grid-cols-2 gap-2.5">{children}</div>;
