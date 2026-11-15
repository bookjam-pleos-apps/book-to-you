import type { ReactNode } from "react";

import { cn } from "../lib/utils";

type SurfaceProps = { readonly children: ReactNode; readonly className?: string };

export const Card = ({ children, className }: SurfaceProps) => (
  <section className={cn("flex flex-col gap-3 rounded-card bg-surface p-4", className)}>{children}</section>
);

// 소리 내어 읽을 문장이다. 안쪽 여백은 디자이너 값(위 24, 오른쪽 16, 아래 24, 왼쪽 24)이다.
export const ScriptCard = ({ children }: { readonly children: ReactNode }) => (
  <p className="rounded-card bg-surface pt-6 whitespace-pre-line pr-4 pb-6 pl-6 text-script font-medium">{children}</p>
);

export const Notice = ({ children, className }: SurfaceProps) => (
  <div role="status" className={cn("rounded-card bg-surface px-4 py-3 text-base/6 text-ink-2", className)}>
    {children}
  </div>
);
