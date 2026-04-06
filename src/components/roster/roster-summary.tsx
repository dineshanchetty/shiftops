"use client";

import { cn } from "@/lib/utils";
import { Clock, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

interface RosterSummaryProps {
  totalScheduledHours: number;
  defaultBudgetHours?: number;
}

export function RosterSummary({
  totalScheduledHours,
  defaultBudgetHours = 0,
}: RosterSummaryProps) {
  const [budgetHours, setBudgetHours] = useState(defaultBudgetHours);
  const [isEditing, setIsEditing] = useState(false);

  const diff = budgetHours > 0 ? totalScheduledHours - budgetHours : 0;
  const isOver = diff > 0;
  const isUnder = diff < 0;

  return (
    <div className="rounded-xl bg-surface border border-base-200 px-4 py-3 mb-4">
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {/* Total Scheduled */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Clock size={16} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-base-400">
              Scheduled
            </p>
            <p className="text-lg font-bold font-mono text-base-900">
              {totalScheduledHours.toFixed(1)}h
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-10 bg-base-200 hidden sm:block" />

        {/* Budget Hours */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Target size={16} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-base-400">
              Budget
            </p>
            {isEditing ? (
              <input
                type="number"
                min={0}
                step={0.5}
                value={budgetHours}
                onChange={(e) => setBudgetHours(Number(e.target.value))}
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditing(false)}
                autoFocus
                className="w-20 h-7 rounded border border-accent bg-surface px-1 text-lg font-bold font-mono text-base-900 focus:outline-none focus:ring-2 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="text-lg font-bold font-mono text-base-900 hover:text-accent transition-colors"
                title="Click to edit budget hours"
              >
                {budgetHours > 0 ? `${budgetHours.toFixed(1)}h` : "Set"}
              </button>
            )}
          </div>
        </div>

        {/* Over/Under indicator */}
        {budgetHours > 0 && (
          <>
            <div className="w-px h-10 bg-base-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              {isOver ? (
                <TrendingUp size={16} className="text-red-600" />
              ) : isUnder ? (
                <TrendingDown size={16} className="text-green-600" />
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  isOver && "bg-[var(--color-danger-soft)] text-red-700",
                  isUnder && "bg-[var(--color-success-soft)] text-green-700",
                  !isOver && !isUnder && "bg-base-200 text-base-700"
                )}
              >
                {isOver
                  ? `+${diff.toFixed(1)}h over`
                  : isUnder
                  ? `${Math.abs(diff).toFixed(1)}h under`
                  : "On target"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
