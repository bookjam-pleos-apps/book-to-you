import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

// 누를 수 없는 표시 칩이다(장 수 "2 / 5" 등).
export const Badge = ({ className, ...props }: ComponentProps<"span">) => (
  <span
    data-slot="badge"
    className={cn("inline-flex h-6 shrink-0 items-center rounded-full bg-fill px-4 text-caption font-bold text-ink-2 tabular-nums", className)}
    {...props}
  />
);
