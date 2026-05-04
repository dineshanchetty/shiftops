"use client";

import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { RosterEntry, Staff, Position } from "@/lib/types";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

export interface ShiftTemplate {
  id: string;
  name: string;
  shift_start: string;  // "HH:MM" or "HH:MM:SS"
  shift_end: string;
  is_active: boolean;
}

/** Aggregated last-year hours for one date (the same date 364 days back). */
export interface PrevYearDaySummary {
  date: string;            // current-year date (the panel's date)
  prevDate: string;        // 364 days back
  totalHours: number;
  prevYrTurnover: number | null;  // gross_turnover from same-DOW prev year
  perStaff: { staff_id: string; first_name: string; last_name: string; hours: number }[];
}

interface CalendarGridProps {
  entries: EntryWithStaff[];
  staff: Staff[];
  positions?: Position[];
  shiftTemplates?: ShiftTemplate[];
  /** Map keyed by current-year date string → prev-year summary for the same DOW. */
  prevYearByDate?: Map<string, PrevYearDaySummary>;
  dateRange: { start: Date; end: Date };
  onDateClick: (date: string) => void;
  loading?: boolean;
  workingDays?: string[];
  openingTime?: string;
  closingTime?: string;
  branchId?: string;
  tenantId?: string;
  onEntryUpdated?: () => void;
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

/* ─── Daily Detail Panel — auto-list staff + template dropdown ─── */

interface DailyDetailPanelProps {
  dateStr: string;
  entries: EntryWithStaff[];
  allStaff: Staff[];
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  prevYear?: PrevYearDaySummary;
  onEditShifts: () => void;
  onEntryUpdated?: () => void;
  openingTime?: string;
  closingTime?: string;
  branchId?: string;
  tenantId?: string;
}

function DailyDetailPanel({
  dateStr,
  entries,
  allStaff,
  positions,
  prevYear,
  shiftTemplates,
  openingTime,
  closingTime,
  branchId,
  tenantId,
  onEntryUpdated,
}: DailyDetailPanelProps) {
  const supabase = createClient();
  const [localEntries, setLocalEntries] = useState<EntryWithStaff[]>(entries);
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);

  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  // Identify managers
  const managerPosId = positions?.find((p) => p.name.toLowerCase() === "manager")?.id;

  // Active templates only, sorted by start time
  const activeTemplates = useMemo(
    () => [...shiftTemplates].filter((t) => t.is_active).sort((a, b) => a.shift_start.localeCompare(b.shift_start)),
    [shiftTemplates]
  );

  // Build entry-by-staff map for O(1) lookup
  const entryByStaff = useMemo(() => {
    const m = new Map<string, EntryWithStaff>();
    for (const e of localEntries) m.set(e.staff_id, e);
    return m;
  }, [localEntries]);

  // Active staff for this branch
  const activeStaff = useMemo(
    () => allStaff.filter((s) => s.active !== false),
    [allStaff]
  );

  const managerStaff = activeStaff.filter((s) => managerPosId && s.position_id === managerPosId);
  const regularStaff = activeStaff.filter((s) => !managerPosId || s.position_id !== managerPosId);

  // Timeline range for the visual Gantt
  const rangeStartMin = parseTimeToMinutes(openingTime ?? "06:00");
  const rangeEndMin = parseTimeToMinutes(closingTime ?? "23:00");
  const totalRangeMin = rangeEndMin - rangeStartMin;

  const hours: number[] = [];
  for (let h = Math.floor(rangeStartMin / 60); h <= Math.ceil(rangeEndMin / 60); h++) hours.push(h);

  const today = new Date();
  const isToday = dateStr === toDateStr(today);
  let currentTimePercent: number | null = null;
  if (isToday) {
    const nowMin = today.getHours() * 60 + today.getMinutes();
    if (nowMin >= rangeStartMin && nowMin <= rangeEndMin) {
      currentTimePercent = ((nowMin - rangeStartMin) / totalRangeMin) * 100;
    }
  }

  // ─── Apply selection ──────────────────────────────────────────────────────
  // value codes: ""=not scheduled, "off"=leave/off, "<templateId>"=working that template

  async function handleSelect(staffId: string, value: string) {
    if (!branchId || !tenantId) return;
    setSavingStaffId(staffId);

    const existing = entryByStaff.get(staffId);

    try {
      if (value === "") {
        // Not scheduled: delete row if it exists
        if (existing) {
          await supabase.from("roster_entries").delete().eq("id", existing.id);
          setLocalEntries((prev) => prev.filter((e) => e.id !== existing.id));
        }
      } else if (value === "off") {
        // OFF / Leave: upsert with is_off=true
        const payload = {
          staff_id: staffId,
          branch_id: branchId,
          tenant_id: tenantId,
          date: dateStr,
          shift_start: null,
          shift_end: null,
          shift_hours: null,
          is_off: true,
        };
        if (existing) {
          await supabase.from("roster_entries").update(payload).eq("id", existing.id);
          setLocalEntries((prev) => prev.map((e) => e.id === existing.id ? { ...e, ...payload } as EntryWithStaff : e));
        } else {
          const { data } = await supabase.from("roster_entries").insert(payload).select("*").single();
          if (data) {
            const staffRec = allStaff.find((s) => s.id === staffId);
            if (staffRec) {
              setLocalEntries((prev) => [...prev, { ...(data as RosterEntry), staff: { first_name: staffRec.first_name, last_name: staffRec.last_name, position_id: staffRec.position_id, sub_position_id: staffRec.sub_position_id ?? null } } as EntryWithStaff]);
            }
          }
        }
      } else {
        // Template: upsert with template times
        const tmpl = activeTemplates.find((t) => t.id === value);
        if (!tmpl) return;
        const start = tmpl.shift_start.slice(0, 5);
        const end = tmpl.shift_end.slice(0, 5);
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const hours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);

        const payload = {
          staff_id: staffId,
          branch_id: branchId,
          tenant_id: tenantId,
          date: dateStr,
          shift_start: tmpl.shift_start,
          shift_end: tmpl.shift_end,
          shift_hours: hours,
          is_off: false,
        };
        if (existing) {
          await supabase.from("roster_entries").update(payload).eq("id", existing.id);
          setLocalEntries((prev) => prev.map((e) => e.id === existing.id ? { ...e, ...payload } as EntryWithStaff : e));
        } else {
          const { data } = await supabase.from("roster_entries").insert(payload).select("*").single();
          if (data) {
            const staffRec = allStaff.find((s) => s.id === staffId);
            if (staffRec) {
              setLocalEntries((prev) => [...prev, { ...(data as RosterEntry), staff: { first_name: staffRec.first_name, last_name: staffRec.last_name, position_id: staffRec.position_id, sub_position_id: staffRec.sub_position_id ?? null } } as EntryWithStaff]);
            }
          }
        }
      }
      onEntryUpdated?.();
    } finally {
      setSavingStaffId(null);
    }
  }

  // Format template label e.g. "Morning · 06:00–14:00"
  const tmplLabel = (t: ShiftTemplate) => `${t.name} · ${t.shift_start.slice(0, 5)}–${t.shift_end.slice(0, 5)}`;

  // Render a single staff row with dropdown + Gantt visualization
  function renderRow(s: Staff) {
    const entry = entryByStaff.get(s.id);
    const posName = getPositionName(s.position_id, positions);
    const colors = posName ? GANTT_BAR_COLORS[posName] ?? DEFAULT_BAR_COLOR : DEFAULT_BAR_COLOR;
    const isSaving = savingStaffId === s.id;

    let value = "";
    if (entry?.is_off) value = "off";
    else if (entry?.shift_start && entry?.shift_end) {
      // Match a template by start+end
      const matched = activeTemplates.find((t) =>
        t.shift_start.slice(0, 5) === entry.shift_start!.slice(0, 5) &&
        t.shift_end.slice(0, 5) === entry.shift_end!.slice(0, 5)
      );
      if (matched) value = matched.id;
      else value = "custom"; // pre-existing custom shift
    }

    // Compute bar position
    let barLeft = 0;
    let barWidth = 0;
    let hasBar = false;
    if (!entry?.is_off && entry?.shift_start && entry?.shift_end) {
      const sMin = parseTimeToMinutes(entry.shift_start);
      const eMin = parseTimeToMinutes(entry.shift_end);
      barLeft = Math.max(0, ((sMin - rangeStartMin) / totalRangeMin) * 100);
      barWidth = Math.min(100 - barLeft, ((eMin - sMin) / totalRangeMin) * 100);
      hasBar = barWidth > 0;
    }

    return (
      <div key={s.id} className="flex items-center gap-2 py-1">
        <div className="w-[160px] sm:w-[200px] shrink-0 pr-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors.bg }} />
            <span className="text-xs font-medium text-base-700 truncate">
              {s.first_name} {s.last_name?.[0] ?? ""}.
            </span>
          </div>
        </div>

        {/* Dropdown */}
        <div className="w-[180px] shrink-0">
          <select
            value={value === "custom" ? "" : value}
            onChange={(e) => handleSelect(s.id, e.target.value)}
            disabled={isSaving}
            className={cn(
              "w-full text-xs rounded-md border bg-white px-2 py-1 outline-none transition-colors",
              entry?.is_off ? "border-amber-300 bg-amber-50 text-amber-700" :
              hasBar ? "border-base-200 text-base-700" :
              "border-gray-200 text-gray-400"
            )}
          >
            <option value="">— Not scheduled —</option>
            {activeTemplates.map((t) => (
              <option key={t.id} value={t.id}>{tmplLabel(t)}</option>
            ))}
            <option value="off">Leave / OFF</option>
            {value === "custom" && (
              <option value="custom" disabled>
                Custom: {entry!.shift_start!.slice(0,5)}–{entry!.shift_end!.slice(0,5)}
              </option>
            )}
          </select>
        </div>

        {/* Gantt visualization (read-only) */}
        <div className="flex-1 relative h-[28px]">
          {hours.map((h) => {
            const pct = ((h * 60 - rangeStartMin) / totalRangeMin) * 100;
            if (pct <= 0 || pct >= 100) return null;
            return (
              <div key={h} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${pct}%` }} />
            );
          })}
          {currentTimePercent !== null && (
            <div className="absolute top-0 bottom-0 w-px border-l border-dashed border-red-500 z-10" style={{ left: `${currentTimePercent}%` }} />
          )}
          {hasBar && (
            <div
              className="absolute top-[3px] h-[22px] rounded-md shadow-sm flex items-center px-2 select-none"
              style={{ left: `${barLeft}%`, width: `${barWidth}%`, backgroundColor: colors.bg }}
              title={`${entry!.shift_start!.slice(0,5)}–${entry!.shift_end!.slice(0,5)}`}
            >
              {barWidth > 8 && (
                <span className="text-[10px] font-medium leading-none truncate" style={{ color: colors.text }}>
                  {entry!.shift_start!.slice(0,5)}–{entry!.shift_end!.slice(0,5)}
                </span>
              )}
            </div>
          )}
          {entry?.is_off && (
            <div className="absolute inset-0 flex items-center">
              <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">OFF / LEAVE</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Stats
  const workingCount = localEntries.filter((e) => !e.is_off && e.shift_start).length;
  const offCount = localEntries.filter((e) => e.is_off).length;
  const totalHours = localEntries.reduce((s, e) => s + (e.shift_hours ?? 0), 0);

  const noTemplates = activeTemplates.length === 0;

  return (
    <div className="border-t border-base-200 bg-surface rounded-b-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-base-200">
        <div>
          <h3 className="text-base font-semibold text-base-900">{formatFullDate(dateStr)}</h3>
          <p className="text-sm text-base-500 mt-0.5">
            {workingCount} on · {offCount} off · {Math.round(totalHours)}h total
          </p>
        </div>
      </div>

      {/* ─── Ghost roster: last year same DOW (top, compact) ─── */}
      {prevYear && (prevYear.totalHours > 0 || (prevYear.prevYrTurnover ?? 0) > 0) && (
        <div className="mx-4 sm:mx-6 mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              👻 Last year same day ({prevYear.prevDate})
            </span>
            <span className="text-[11px] text-gray-500">
              {prevYear.totalHours > 0 && <>Hours: <span className="font-mono font-semibold text-gray-700">{Math.round(prevYear.totalHours)}h</span></>}
              {prevYear.totalHours > 0 && (prevYear.prevYrTurnover ?? 0) > 0 && " · "}
              {(prevYear.prevYrTurnover ?? 0) > 0 && <>Revenue: <span className="font-mono font-semibold text-gray-700">R{prevYear.prevYrTurnover!.toFixed(0)}</span></>}
            </span>
          </div>
          {prevYear.perStaff.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-0.5">
              {prevYear.perStaff.filter((p) => p.hours > 0).map((p) => (
                <div key={p.staff_id} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <span className="truncate">{p.first_name} {p.last_name?.[0] ?? ""}.</span>
                  <span className="ml-auto font-mono text-gray-500">{p.hours}h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No templates warning */}
      {noTemplates && (
        <div className="mx-4 sm:mx-6 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No shift templates defined for this branch. Add some in <strong>Settings → Branches → Shift Templates</strong>.
        </div>
      )}

      {/* Hour header */}
      <div className="px-4 sm:px-6 pt-3">
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="flex items-center gap-2 pb-2 border-b border-base-100">
              <div className="w-[160px] sm:w-[200px] shrink-0 pr-2 text-[10px] font-semibold uppercase tracking-wider text-base-400">Staff</div>
              <div className="w-[180px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-base-400">Shift</div>
              <div className="flex-1 relative h-5">
                {hours.map((h) => {
                  const pct = ((h * 60 - rangeStartMin) / totalRangeMin) * 100;
                  if (pct < 0 || pct > 100) return null;
                  return (
                    <span key={h} className="absolute text-[10px] font-mono text-base-400 -translate-x-1/2" style={{ left: `${pct}%` }}>
                      {String(h).padStart(2, "0")}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Managers section */}
            {managerStaff.length > 0 && (
              <div className="mb-2 mt-2">
                <div className="flex items-center gap-2 py-1.5 border-b border-purple-200 mb-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">Managers</span>
                </div>
                <div className="bg-purple-50/30 rounded-md px-1">
                  {managerStaff.map((s) => renderRow(s))}
                </div>
              </div>
            )}

            {/* Staff section */}
            {regularStaff.length > 0 && (
              <div className="mb-2 mt-2">
                <div className="flex items-center gap-2 py-1.5 border-b border-blue-200 mb-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Staff</span>
                </div>
                {regularStaff.map((s) => renderRow(s))}
              </div>
            )}

            {activeStaff.length === 0 && (
              <div className="py-8 text-center text-sm text-base-400">
                No active staff for this branch.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
/* ─── Main CalendarGrid ─── */

export function CalendarGrid({
  entries,
  staff,
  positions = [],
  shiftTemplates = [],
  prevYearByDate,
  dateRange,
  onDateClick,
  loading = false,
  workingDays,
  openingTime,
  closingTime,
  branchId,
  tenantId,
  onEntryUpdated,
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

  // branchId & tenantId come from props now (used to be derived from entries[0],
  // but that broke when there were no entries for the day yet).
  // Fall back to inferring from any entry only if props are missing (legacy callers).
  const effectiveBranchId = branchId ?? entries[0]?.branch_id;
  const effectiveTenantId = tenantId ?? entries[0]?.tenant_id;

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
          allStaff={staff}
          positions={positions}
          shiftTemplates={shiftTemplates}
          prevYear={prevYearByDate?.get(selectedDate)}
          onEditShifts={handleEditShifts}
          onEntryUpdated={onEntryUpdated}
          openingTime={openingTime}
          closingTime={closingTime}
          branchId={effectiveBranchId}
          tenantId={effectiveTenantId}
        />
      )}
    </div>
  );
}
