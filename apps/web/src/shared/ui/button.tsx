import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

// brand는 주 버튼이다. 색은 button-brand, on-button-brand 두 토큰만 쓴다(theme.css).
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap transition-[transform,opacity] select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        brand: "bg-button-brand text-on-button-brand shadow-cta",
        outline: "border border-brand bg-surface text-ink-2 shadow-button",
        light: "bg-surface text-ink",
        ghost: "bg-fill text-ink-2",
        danger: "bg-danger-soft text-danger-text",
      },
      size: {
        default: "h-12 px-5 text-button font-bold",
        cta: "h-12 px-5 text-cta font-extrabold",
      },
    },
    defaultVariants: { variant: "brand", size: "default" },
  },
);

type ButtonProps = Omit<ButtonPrimitive.Props, "className"> &
  VariantProps<typeof buttonVariants> & { readonly className?: string };

export const Button = ({ className, variant, size, type = "button", ...props }: ButtonProps) => (
  <ButtonPrimitive data-slot="button" type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
);
