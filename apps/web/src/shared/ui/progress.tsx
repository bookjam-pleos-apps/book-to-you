import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "../lib/utils";

// thick은 듣기 화면의 장 칸이다(차량 재생 화면의 진행 칸 두께).
type ProgressProps = Omit<ProgressPrimitive.Root.Props, "className" | "children"> & { readonly className?: string; readonly thick?: boolean };

// 채움은 brand, 바닥은 검정 10%다. role="progressbar"와 aria-valuenow는 Base UI가 붙인다.
export const Progress = ({ className, thick = false, ...props }: ProgressProps) => (
  <ProgressPrimitive.Root data-slot="progress" className={cn("w-full", className)} {...props}>
    <ProgressPrimitive.Track data-slot="progress-track" className={cn("relative w-full overflow-hidden rounded-full bg-fill-strong", thick ? "h-2" : "h-1")}>
      <ProgressPrimitive.Indicator data-slot="progress-indicator" className="h-full rounded-full bg-brand" />
    </ProgressPrimitive.Track>
  </ProgressPrimitive.Root>
);
