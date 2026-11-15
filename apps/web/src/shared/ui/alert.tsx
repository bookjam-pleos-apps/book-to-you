import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

const alertVariants = cva("group/alert grid w-full gap-0.5 rounded-alert px-4 py-3 text-left", {
  variants: {
    variant: {
      default: "bg-surface",
      danger: "border-2 border-danger bg-danger-soft",
    },
  },
  defaultVariants: { variant: "default" },
});

type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

export const Alert = ({ className, variant = "default", ...props }: AlertProps) => (
  <div data-slot="alert" data-variant={variant} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);

export const AlertTitle = ({ className, ...props }: ComponentProps<"strong">) => (
  <strong
    data-slot="alert-title"
    className={cn("text-label font-extrabold text-ink group-data-[variant=danger]/alert:text-danger-text", className)}
    {...props}
  />
);

export const AlertDescription = ({ className, ...props }: ComponentProps<"p">) => (
  <p data-slot="alert-description" className={cn("text-caption text-ink-2", className)} {...props} />
);

// 화면마다 쓰는 문제 안내다. 제목 한 줄과 고칠 방법 한 줄로 쓴다.
export const ProblemAlert = ({ title, body }: { readonly title: string; readonly body: string }) => (
  <Alert variant="danger">
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>{body}</AlertDescription>
  </Alert>
);
