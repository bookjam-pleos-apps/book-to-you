import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

type FieldProps = Omit<ComponentProps<"input">, "className"> & { readonly code?: boolean };

export const TextField = ({ code = false, ...props }: FieldProps) => (
  <input
    className={cn(
      "h-12 w-full rounded-card border border-line bg-surface px-4 text-label font-semibold placeholder:font-normal placeholder:text-ink-3",
      code && "text-center text-xl tracking-[0.3em] tabular-nums",
    )}
    {...props}
  />
);
