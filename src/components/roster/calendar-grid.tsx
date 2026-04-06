"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ShiftChip } from "./shift-chip";
import type { RosterEntry, Staff } from "@/lib/types";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

interface CalendarGridProps {
  entries: EntryWithStaff[];
  staff: Staff[];
  dateRange: { start: Date; end: Date };
  onDateClick: (date: string) => void;
  loading?: boolean;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build an array of weeks, each week being an array of 7 Date|null cells (Mon-Sun).
 * We pad the start and end to align with week boundaries.
 */
function buildWeeks(start: Date, end: Date): (Date | null)[][] {
  const weeks: (Date | null)[][] = [];

  // Find the Monday on or before the start date
  const firstDay = new Date(start);
  const dayOfWeek = firstDay.getDay(); // 0=Sun, 1=Mon, ...
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // convert to Mon=0 basis
  firstDay.setDate(firstDay.getDate() - offset);

  // Find the Sunday on or after the end date
  const lastDay = new Date(end);
  const endDayOfWeek = lastDay.getDay();
  const endOffset = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  lastDay.setDate(lastDay.getDate() + endOffset);

  const cursor = new Date(firstDay);
  while (cursor <= lastDay) {
    const week: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (cursor >= start && cursor <= end) {
        week.push(new Date(cursor));
      } else {
        week.push(null);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

export function CalendarGrid({
  entries,
  dateRange,
  onDateClick,
  loading = false,
}: CalendarGridProps) {
  const today = useMemo(() => new Date(), []);
  const todayStr = toDateStr(today);

  // Group entries by date string
  const entriesByDate = useMemo(() => {
    const map = new Map<string, EntryWithStaff[]>();
    for (const entry of entries) {
      const key = entry.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [entries]);

  const weeks = useMemo(
    () => buildWeeks(dateRange.start, dateRange.end),
    [dateRange.start, dateRange.end]
  );

  // Compute which day-of-week index (0-6) is today, or -1 if today is outside range
  const todayColIndex = useMemo(() => {
    const d = today.getDay();
    return d === 0 ? 6 : d - 1;
  }, [today]);

  const isTodayInRange =
    today >= dateRange.start && today <= dateRange.end;

  if (loading) {
    return (
      <div className="rounded-xl border border-base-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 bg-base-800">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-semibold uppercase text-white"
            >
              {d}
            </div>
          ))}
        </div>
        {/* Skeleton rows */}
        {Array.from({ length: 5 }).map((_, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {Array.from({ length: 7 }).map((_, di) => (
              <div
                key={di}
                className="min-h-[100px] border-r border-b border-gray-200 p-2"
              >
                <div className="h-4 w-6 rounded bg-base-200 animate-pulse mb-2" />
                <div className="space-y-1.5">
                  <div className="h-8 rounded-lg bg-base-200 animate-pulse" />
                  <div className="h-8 rounded-lg bg-base-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-base-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 bg-base-800">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-semibold uppercase text-white"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-full bg-base-200 flex items-center justify-center mb-4">
            <Plus size={24} className="text-base-400" />
          </div>
          <p className="text-base font-medium text-base-700">
            No shifts scheduled
          </p>
          <p className="text-sm text-base-400 mt-1">
            Click on a date in the calendar to add shifts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-base-200 overflow-hidden">
      {/* Desktop view */}
      <div className="hidden md:block">
        {/* Header */}
        <div className="grid grid-cols-7 bg-base-800">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={cn(
                "px-2 py-2 text-center text-xs font-semibold uppercase text-white",
                isTodayInRange && i === todayColIndex && "bg-blue-900/30"
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date, di) => {
              if (!date) {
                return (
                  <div
                    key={di}
                    className="min-h-[100px] border-r border-b border-gray-200 bg-gray-50/50"
                  />
                );
              }

              const dateStr = toDateStr(date);
              const dayEntries = entriesByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const totalHours = dayEntries.reduce(
                (sum, e) => sum + (e.is_off ? 0 : (e.shift_hours ?? 0)),
                0
              );

              return (
                <button
                  key={di}
                  onClick={() => onDateClick(dateStr)}
                  className={cn(
                    "min-h-[100px] border-r border-b border-gray-200 p-2 text-left transition-colors hover:bg-surface-2 group relative",
                    isToday && "bg-blue-50/60",
                    isTodayInRange && di === todayColIndex && !isToday && "bg-blue-50/20"
                  )}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-sm",
                        isToday
                          ? "font-bold text-accent"
                          : "font-medium text-base-700"
                      )}
                    >
                      {date.getDate()}
                    </span>
                    {dayEntries.length === 0 && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus size={14} className="text-base-400" />
                      </span>
                    )}
                  </div>

                  {/* Shift chips */}
                  <div className="space-y-1">
                    {dayEntries.map((entry) => (
                      <ShiftChip
                        key={entry.id}
                        staffName={`${entry.staff.first_name} ${entry.staff.last_name.charAt(0)}.`}
                        shiftStart={entry.shift_start}
                        shiftEnd={entry.shift_end}
                        shiftHours={entry.shift_hours}
                        isOff={entry.is_off ?? false}
                      />
                    ))}
                  </div>

                  {/* Total hours footer */}
                  {dayEntries.length > 0 && (
                    <div className="mt-1.5 pt-1 border-t border-gray-100">
                      <span className="text-[10px] font-mono text-base-400">
                        Total: {totalHours.toFixed(0).padStart(2, "0")}:00
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Mobile view - 3-day scroll */}
      <div className="md:hidden">
        {/* Header */}
        <div className="grid grid-cols-3 bg-base-800">
          {DAY_HEADERS.slice(0, 3).map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-semibold uppercase text-white"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${
                weeks.length * 7
              }, minmax(120px, 1fr))`,
              gridAutoFlow: "column",
            }}
          >
            {weeks.flatMap((week) =>
              week.map((date, di) => {
                if (!date) {
                  return (
                    <div
                      key={`m-${di}-${Math.random()}`}
                      className="min-h-[120px] border-r border-b border-gray-200 bg-gray-50/50 min-w-[120px]"
                    />
                  );
                }

                const dateStr = toDateStr(date);
                const dayEntries = entriesByDate.get(dateStr) ?? [];
                const isToday = dateStr === todayStr;
                const totalHours = dayEntries.reduce(
                  (sum, e) => sum + (e.is_off ? 0 : (e.shift_hours ?? 0)),
                  0
                );

                return (
                  <button
                    key={`m-${dateStr}`}
                    onClick={() => onDateClick(dateStr)}
                    className={cn(
                      "min-h-[120px] min-w-[120px] border-r border-b border-gray-200 p-2 text-left transition-colors hover:bg-surface-2",
                      isToday && "bg-blue-50/60"
                    )}
                  >
                    <div className="mb-1">
                      <span className="text-xs text-base-400">
                        {DAY_HEADERS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                      </span>
                      <span
                        className={cn(
                          "ml-1 text-sm",
                          isToday
                            ? "font-bold text-accent"
                            : "font-medium text-base-700"
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {dayEntries.map((entry) => (
                        <ShiftChip
                          key={entry.id}
                          staffName={`${entry.staff.first_name} ${entry.staff.last_name.charAt(0)}.`}
                          shiftStart={entry.shift_start}
                          shiftEnd={entry.shift_end}
                          shiftHours={entry.shift_hours}
                          isOff={entry.is_off ?? false}
                        />
                      ))}
                    </div>

                    {dayEntries.length > 0 && (
                      <div className="mt-1 text-[10px] font-mono text-base-400">
                        Total: {totalHours.toFixed(0).padStart(2, "0")}:00
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
