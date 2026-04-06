"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";

const POSITION_COLORS: Record<string, string> = {
  FOH: "#16A34A",
  BOH: "#2563EB",
  Driver: "#F5A623",
  Manager: "#7C3AED",
};

interface ShiftChipProps {
  staffName: string;
  positionName?: string;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shiftHours?: number | null;
  isOff: boolean;
}

export function ShiftChip({
  staffName,
  positionName,
  shiftStart,
  shiftEnd,
  shiftHours,
  isOff,
}: ShiftChipProps) {
  const dotColor = positionName
    ? POSITION_COLORS[positionName] ?? "#9CA3AF"
    : "#9CA3AF";

  if (isOff) {
    return (
      <div
        className={cn(
          "rounded-lg px-2.5 py-1.5 bg-base-200 text-base-600",
          "transition-all duration-150 hover:scale-[1.02] hover:shadow-sm",
          "cursor-default"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm font-medium">{staffName}</span>
        </div>
        <p className="text-xs font-mono text-base-400 mt-0.5">OFF</p>
      </div>
    );
  }

  const formattedStart = shiftStart ? formatTime(shiftStart) : "--:--";
  const formattedEnd = shiftEnd ? formatTime(shiftEnd) : "--:--";
  const hours = shiftHours ?? 0;

  return (
    <div
      className={cn(
        "rounded-lg px-2.5 py-1.5 bg-accent-soft",
        "transition-all duration-150 hover:scale-[1.02] hover:shadow-sm",
        "cursor-default"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-sm font-medium text-base-900">{staffName}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs font-mono text-gray-500">
          {formattedStart}&ndash;{formattedEnd}
        </span>
        <span className="text-xs bg-gray-100 rounded px-1 text-gray-600">
          {Math.round(hours)}h
        </span>
      </div>
    </div>
  );
}
