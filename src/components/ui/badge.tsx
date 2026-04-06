import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-base-200 text-base-700",
        success:
          "bg-[var(--color-success-soft)] text-green-700",
        warning:
          "bg-[var(--color-warning-soft)] text-amber-700",
        danger:
          "bg-[var(--color-danger-soft)] text-red-700",
        info: "bg-[var(--color-info-soft)] text-blue-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        className={cn(badgeVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
