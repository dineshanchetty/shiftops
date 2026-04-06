"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";

interface ShiftChipProps {
  staffName: string;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shiftHours?: number | null;
  isOff: boolean;
}

export function ShiftChip({
  staffName,
  shiftStart,
  shiftEnd,
  shiftHours,
  isOff,
}: ShiftChipProps) {
  if (isOff) {
    return (
      <div
        className={cn(
          "rounded-lg px-2 py-1 bg-base-200 text-base-600",
          "transition-all duration-150 hover:scale-[1.02] hover:shadow-sm",
          "cursor-default"
        )}
      >
        <p className="text-sm font-medium truncate">{staffName}</p>
        <p className="text-xs font-mono text-base-400">OFF</p>
      </div>
    );
  }

  const formattedStart = shiftStart ? formatTime(shiftStart) : "--:--";
  const formattedEnd = shiftEnd ? formatTime(shiftEnd) : "--:--";

  return (
    <div
      className={cn(
        "rounded-lg px-2 py-1 bg-accent-soft",
        "transition-all duration-150 hover:scale-[1.02] hover:shadow-sm",
        "cursor-default"
      )}
    >
      <p className="text-sm font-medium text-base-900 truncate">{staffName}</p>
      <p className="text-xs font-mono text-base-600">
        {formattedStart}={formattedEnd} ({String(shiftHours ?? 0).padStart(2, "0")}:00)
      </p>
    </div>
  );
}
