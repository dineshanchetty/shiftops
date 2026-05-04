import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  delta?: number;
  icon?: React.ReactNode;
  /** Optional small footer line, e.g. "vs Prev Yr R12,345 (+47%)" */
  footer?: React.ReactNode;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, delta, icon, footer, ...props }, ref) => {
    const isPositive = delta !== undefined && delta >= 0;
    const isNegative = delta !== undefined && delta < 0;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl bg-surface p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium uppercase tracking-wide text-base-400">
              {label}
            </span>
            <span className="text-xl font-bold font-mono text-base-900">
              {value}
            </span>
          </div>
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              {icon}
            </div>
          )}
        </div>

        {delta !== undefined && (
          <div className="mt-3 flex items-center gap-1.5">
            {isPositive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-xs font-semibold text-green-700">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {delta}%
              </span>
            )}
            {isNegative && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-danger-soft)] px-2 py-0.5 text-xs font-semibold text-red-700">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M6 2.5V9.5M6 9.5L3 6.5M6 9.5L9 6.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {Math.abs(delta)}%
              </span>
            )}
          </div>
        )}
        {footer && (
          <div className="mt-2 text-[11px] text-base-500 leading-tight">{footer}</div>
        )}
      </div>
    );
  }
);
StatCard.displayName = "StatCard";

export { StatCard };
