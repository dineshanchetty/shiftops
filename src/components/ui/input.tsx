import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  compact?: boolean;
  currency?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, compact, currency, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-base-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {currency && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-base-400">
              R
            </span>
          )}
          <input
            id={inputId}
            className={cn(
              "w-full rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900 placeholder:text-base-400 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
              "disabled:cursor-not-allowed disabled:opacity-50",
              compact ? "h-9" : "h-10",
              error && "border-[var(--color-danger)] focus:ring-[var(--color-danger)]",
              currency && "pl-7 text-right font-mono",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
