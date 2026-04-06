"use client";

import { Clock, Users } from "lucide-react";

interface RosterSummaryProps {
  totalScheduledHours: number;
  staffCount: number;
}

export function RosterSummary({
  totalScheduledHours,
  staffCount,
}: RosterSummaryProps) {
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

        {/* Staff Count */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Users size={16} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-base-400">
              Staff
            </p>
            <p className="text-lg font-bold font-mono text-base-900">
              {staffCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
