"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RosterEntry, Staff, Position } from "@/lib/types";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

interface CalendarGridProps {
  entries: EntryWithStaff[];
  staff: Staff[];
  positions?: Position[];
  dateRange: { start: Date; end: Date };
  onDateClick: (date: string) => void;
  loading?: boolean;
  workingDays?: string[];
  openingTime?: string;
  closingTime?: string;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];


function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Build an array of weeks, each week being an array of 7 Date|null cells (Mon-Sun).
 */
function buildWeeks(start: Date, end: Date): (Date | null)[][] {
  const weeks: (Date | null)[][] = [];

  const firstDay = new Date(start);
  const dayOfWeek = firstDay.getDay();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  firstDay.setDate(firstDay.getDate() - offset);

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

function getPositionName(positionId: string | null | undefined, positions: Position[]): string | undefined {
  if (!positionId || positions.length === 0) return undefined;
  return positions.find((p) => p.id === positionId)?.name;
}

/** Compact day cell summary data */
interface DaySummary {
  staffCount: number;
  totalHours: number;
  allFilled: boolean;
  hasEntries: boolean;
}

function computeDaySummary(dayEntries: EntryWithStaff[]): DaySummary {
  const workingEntries = dayEntries.filter((e) => !e.is_off);
  const staffCount = workingEntries.length;
  const totalHours = workingEntries.reduce((sum, e) => sum + (e.shift_hours ?? 0), 0);
  const allFilled = staffCount > 0 && workingEntries.every((e) => e.shift_start && e.shift_end);
  return { staffCount, totalHours, allFilled, hasEntries: dayEntries.length > 0 };
}

/* ─── Time helpers for Gantt ─── */

/** Parse "HH:MM" to minutes since midnight */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Bar color based on position name */
const GANTT_BAR_COLORS: Record<string, { bg: string; text: string }> = {
  FOH: { bg: "#16A34A", text: "#FFFFFF" },
  BOH: { bg: "#2563EB", text: "#FFFFFF" },
  Driver: { bg: "#F5A623", text: "#FFFFFF" },
  Manager: { bg: "#7C3AED", text: "#FFFFFF" },
};

const DEFAULT_BAR_COLOR = { bg: "#9CA3AF", text: "#FFFFFF" };

/* ─── Daily Detail Panel (Gantt Timeline) ─── */

function DailyDetailPanel({
  dateStr,
  entries,
  positions,
  onEditShifts,
  openingTime,
  closingTime,
}: {
  dateStr: string;
  entries: EntryWithStaff[];
  positions: Position[];
  onEditShifts: () => void;
  openingTime?: string;
  closingTime?: string;
}) {
  const workingEntries = entries.filter((e) => !e.is_off);
  const offEntries = entries.filter((e) => e.is_off);
  const totalHours = workingEntries.reduce((sum, e) => sum + (e.shift_hours ?? 0), 0);
  const staffCount = workingEntries.length;

  // Timeline range
  const rangeStartMin = parseTimeToMinutes(openingTime ?? "06:00");
  const rangeEndMin = parseTimeToMinutes(closingTime ?? "23:00");
  const totalRangeMin = rangeEndMin - rangeStartMin;

  // Generate hour markers
  const startHour = Math.floor(rangeStartMin / 60);
  const endHour = Math.ceil(rangeEndMin / 60);
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }

  // Current time indicator (only if viewing today)
  const today = new Date();
  const todayStr = toDateStr(today);
  const isToday = dateStr === todayStr;
  let currentTimePercent: number | null = null;
  if (isToday) {
    const nowMin = today.getHours() * 60 + today.getMinutes();
    if (nowMin >= rangeStartMin && nowMin <= rangeEndMin) {
      currentTimePercent = ((nowMin - rangeStartMin) / totalRangeMin) * 100;
    }
  }

  return (
    <div className="border-t border-base-200 bg-surface rounded-b-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-base-200">
        <div>
          <h3 className="text-base font-semibold text-base-900">
            {formatFullDate(dateStr)}
          </h3>
          <p className="text-sm text-base-500 mt-0.5">
            {staffCount} staff &middot; {Math.round(totalHours)}h total
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onEditShifts}>
          <Pencil size={14} />
          Edit Shifts
        </Button>
      </div>

      {/* Gantt Timeline */}
      <div className="px-4 sm:px-6 py-3">
        {entries.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-base-400 mb-3">No shifts scheduled</p>
            <Button variant="secondary" size="sm" onClick={onEditShifts}>
              <Plus size={14} />
              Add Shifts
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour header row */}
              <div className="flex">
                <div className="w-[140px] sm:w-[180px] shrink-0" />
                <div className="flex-1 relative h-6">
                  {hours.map((h) => {
                    const pct = ((h * 60 - rangeStartMin) / totalRangeMin) * 100;
                    if (pct < 0 || pct > 100) return null;
                    return (
                      <span
                        key={h}
                        className="absolute text-[10px] font-mono text-base-400 -translate-x-1/2"
                        style={{ left: `${pct}%` }}
                      >
                        {String(h).padStart(2, "0")}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Staff rows */}
              {workingEntries.map((entry) => {
                const posName = getPositionName(entry.staff.position_id, positions);
                const colors = posName ? GANTT_BAR_COLORS[posName] ?? DEFAULT_BAR_COLOR : DEFAULT_BAR_COLOR;
                const firstName = entry.staff.first_name;
                const lastInitial = entry.staff.last_name?.[0] ?? "";
                const label = `${firstName} ${lastInitial}.`;
                const fStart = entry.shift_start ? formatTime(entry.shift_start) : "--:--";
                const fEnd = entry.shift_end ? formatTime(entry.shift_end) : "--:--";
                const hoursVal = entry.shift_hours ?? 0;

                // Calculate bar position
                let barLeft = 0;
                let barWidth = 0;
                let hasBar = false;
                if (entry.shift_start && entry.shift_end) {
                  const startMin = parseTimeToMinutes(entry.shift_start);
                  const endMin = parseTimeToMinutes(entry.shift_end);
                  barLeft = Math.max(0, ((startMin - rangeStartMin) / totalRangeMin) * 100);
                  barWidth = Math.min(100 - barLeft, ((endMin - startMin) / totalRangeMin) * 100);
                  hasBar = barWidth > 0;
                }

                return (
                  <div key={entry.id} className="flex items-center group">
                    {/* Staff name */}
                    <div className="w-[140px] sm:w-[180px] shrink-0 pr-3 py-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: colors.bg }}
                        />
                        <span className="text-xs font-medium text-base-700 truncate">
                          {entry.staff.first_name} {entry.staff.last_name}
                        </span>
                      </div>
                    </div>

                    {/* Timeline area */}
                    <div className="flex-1 relative h-[36px]">
                      {/* Hour grid lines */}
                      {hours.map((h) => {
                        const pct = ((h * 60 - rangeStartMin) / totalRangeMin) * 100;
                        if (pct <= 0 || pct >= 100) return null;
                        return (
                          <div
                            key={h}
                            className="absolute top-0 bottom-0 w-px bg-gray-100"
                            style={{ left: `${pct}%` }}
                          />
                        );
                      })}

                      {/* Current time line */}
                      {currentTimePercent !== null && (
                        <div
                          className="absolute top-0 bottom-0 w-px border-l border-dashed border-red-500 z-10"
                          style={{ left: `${currentTimePercent}%` }}
                        />
                      )}

                      {/* Shift bar */}
                      {hasBar && (
                        <div
                          className="absolute top-[4px] h-[28px] rounded-md shadow-sm flex items-center px-2 overflow-hidden cursor-default transition-opacity"
                          style={{
                            left: `${barLeft}%`,
                            width: `${barWidth}%`,
                            backgroundColor: colors.bg,
                          }}
                          title={`${entry.staff.first_name} ${entry.staff.last_name} | ${posName ?? "—"} | ${fStart}–${fEnd} (${Math.round(hoursVal)}h)`}
                        >
                          {barWidth > 8 && (
                            <span
                              className="text-[10px] font-medium truncate leading-none"
                              style={{ color: colors.text }}
                            >
                              {label}
                            </span>
                          )}
                        </div>
                      )}

                      {/* No bar fallback: show time text */}
                      {!hasBar && (
                        <div className="absolute inset-0 flex items-center">
                          <span className="text-[10px] text-base-400 font-mono">
                            {fStart}–{fEnd}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* OFF entries */}
              {offEntries.map((entry) => (
                <div key={entry.id} className="flex items-center opacity-50">
                  <div className="w-[140px] sm:w-[180px] shrink-0 pr-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full shrink-0 bg-gray-300" />
                      <span className="text-xs font-medium text-base-400 truncate line-through">
                        {entry.staff.first_name} {entry.staff.last_name}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 relative h-[36px]">
                    {/* Hour grid lines */}
                    {hours.map((h) => {
                      const pct = ((h * 60 - rangeStartMin) / totalRangeMin) * 100;
                      if (pct <= 0 || pct >= 100) return null;
                      return (
                        <div
                          key={h}
                          className="absolute top-0 bottom-0 w-px bg-gray-100"
                          style={{ left: `${pct}%` }}
                        />
                      );
                    })}
                    <div className="absolute inset-0 flex items-center">
                      <span className="text-[10px] font-semibold text-base-400 bg-base-100 rounded px-1.5 py-0.5">
                        OFF
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main CalendarGrid ─── */

export function CalendarGrid({
  entries,
  positions = [],
  dateRange,
  onDateClick,
  loading = false,
  workingDays,
  openingTime,
  closingTime,
}: CalendarGridProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const todayColIndex = useMemo(() => {
    const d = today.getDay();
    return d === 0 ? 6 : d - 1;
  }, [today]);

  const isTodayInRange = today >= dateRange.start && today <= dateRange.end;

  const workingDaySet = useMemo(() => {
    if (!workingDays) return null;
    return new Set(workingDays);
  }, [workingDays]);

  function handleDayClick(dateStr: string) {
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  }

  function handleEditShifts() {
    if (selectedDate) {
      onDateClick(selectedDate);
    }
  }

  const selectedEntries = useMemo(
    () => (selectedDate ? entriesByDate.get(selectedDate) ?? [] : []),
    [selectedDate, entriesByDate]
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-base-200 overflow-hidden overflow-x-auto">
        <div className="grid bg-base-800" style={{ gridTemplateColumns: "repeat(7, minmax(80px, 1fr))" }}>
          {DAY_HEADERS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase text-white">
              {d}
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, wi) => (
          <div key={wi} className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(80px, 1fr))" }}>
            {Array.from({ length: 7 }).map((_, di) => (
              <div key={di} className="min-h-[60px] border-r border-b border-gray-200 p-2">
                <div className="h-4 w-6 rounded bg-base-200 animate-pulse mb-2" />
                <div className="h-5 w-5 rounded-full bg-base-200 animate-pulse mx-auto" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-base-200 overflow-hidden">
      {/* ─── Desktop compact month view ─── */}
      <div className="hidden md:block">
        <div className="grid bg-base-800" style={{ gridTemplateColumns: "repeat(7, minmax(80px, 1fr))" }}>
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

        {weeks.map((week, wi) => (
          <div key={wi} className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(80px, 1fr))" }}>
            {week.map((date, di) => {
              if (!date) {
                return (
                  <div
                    key={di}
                    className="min-h-[60px] border-r border-b border-gray-200 bg-gray-50/50"
                  />
                );
              }

              const dateStr = toDateStr(date);
              const dayEntries = entriesByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const dayAbbr = DAY_HEADERS[di];
              const isNonWorkingDay = workingDaySet ? !workingDaySet.has(dayAbbr) : false;
              const summary = computeDaySummary(dayEntries);

              // Status dot color
              let statusColor = "bg-gray-300"; // empty
              if (summary.hasEntries) {
                statusColor = summary.allFilled ? "bg-green-500" : "bg-amber-400";
              }

              return (
                <button
                  key={di}
                  onClick={() => handleDayClick(dateStr)}
                  className={cn(
                    "min-h-[60px] border-r border-b border-gray-200 p-2 text-left transition-all group relative",
                    isSelected && "ring-2 ring-accent bg-accent/5",
                    isToday && !isSelected && "bg-blue-50",
                    isTodayInRange && di === todayColIndex && !isToday && !isSelected && "bg-blue-50/20",
                    isNonWorkingDay && "bg-gray-100 opacity-60",
                    !isNonWorkingDay && !isToday && !isSelected && "hover:bg-gray-50"
                  )}
                >
                  {/* Row 1: date + status dot */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-sm",
                        isToday ? "font-bold text-accent" : "font-medium text-base-700"
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", statusColor)} />
                  </div>

                  {/* Row 2: staff count badge + total hours */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0",
                        summary.staffCount > 0
                          ? "bg-accent text-white"
                          : "bg-gray-200 text-gray-400"
                      )}
                    >
                      {summary.staffCount}
                    </span>
                    {summary.totalHours > 0 && (
                      <span className="text-[10px] font-mono text-base-400">
                        {Math.round(summary.totalHours)}h
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ─── Mobile compact view ─── */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 bg-base-800">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="px-1 py-2 text-center text-[10px] font-semibold uppercase text-white">
              {d}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date, di) => {
              if (!date) {
                return (
                  <div
                    key={di}
                    className="min-h-[52px] border-r border-b border-gray-200 bg-gray-50/50"
                  />
                );
              }

              const dateStr = toDateStr(date);
              const dayEntries = entriesByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const summary = computeDaySummary(dayEntries);

              let statusColor = "bg-gray-300";
              if (summary.hasEntries) {
                statusColor = summary.allFilled ? "bg-green-500" : "bg-amber-400";
              }

              return (
                <button
                  key={di}
                  onClick={() => handleDayClick(dateStr)}
                  className={cn(
                    "min-h-[52px] border-r border-b border-gray-200 p-1.5 text-left transition-all",
                    isSelected && "ring-2 ring-accent bg-accent/5",
                    isToday && !isSelected && "bg-blue-50",
                    !isToday && !isSelected && "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        "text-xs",
                        isToday ? "font-bold text-accent" : "font-medium text-base-700"
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", statusColor)} />
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-4 w-4 rounded-full text-[8px] font-bold shrink-0",
                        summary.staffCount > 0
                          ? "bg-accent text-white"
                          : "bg-gray-200 text-gray-400"
                      )}
                    >
                      {summary.staffCount}
                    </span>
                    {summary.totalHours > 0 && (
                      <span className="text-[8px] font-mono text-base-400">
                        {Math.round(summary.totalHours)}h
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ─── Daily Detail Panel ─── */}
      {selectedDate && (
        <DailyDetailPanel
          dateStr={selectedDate}
          entries={selectedEntries}
          positions={positions}
          onEditShifts={handleEditShifts}
          openingTime={openingTime}
          closingTime={closingTime}
        />
      )}
    </div>
  );
}
