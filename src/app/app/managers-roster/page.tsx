"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { saveRosterEntries } from "@/app/app/roster/actions";
import { Check, Loader2, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Branch, Position, Staff, RosterEntry } from "@/lib/types";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

interface CellState {
  entryId?: string;
  start: string;
  end: string;
  isLeave: boolean;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const QUICK_SHIFTS = [
  { label: "Full", start: "08:00", end: "20:00" },
  { label: "AM", start: "08:00", end: "14:00" },
  { label: "PM", start: "14:00", end: "20:00" },
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

function fmtTime(t: string): string {
  if (!t) return "";
  return t.slice(0, 5);
}

export default function ManagersRosterPage() {
  const supabase = createClient();
  const now = new Date();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<Staff[]>([]);
  const [managerPosId, setManagerPosId] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [showPrefill, setShowPrefill] = useState(false);
  const [prefillMgr, setPrefillMgr] = useState<string>("");
  const [prefillPattern, setPrefillPattern] = useState<Record<number, { start: string; end: string }>>(
    // Default: Mon-Fri 08:00-20:00
    { 1: { start: "08:00", end: "20:00" }, 2: { start: "08:00", end: "20:00" }, 3: { start: "08:00", end: "20:00" }, 4: { start: "08:00", end: "20:00" }, 5: { start: "08:00", end: "20:00" } }
  );
  const [bulkSaving, setBulkSaving] = useState(false);

  const [grid, setGrid] = useState<Record<string, CellState>>({});

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Load initial data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();
      if (!member) return;
      setTenantId(member.tenant_id);

      const [branchRes, posRes] = await Promise.all([
        supabase.from("branches").select("*").eq("tenant_id", member.tenant_id),
        supabase.from("positions").select("*").eq("tenant_id", member.tenant_id),
      ]);

      const branchList = (branchRes.data ?? []) as Branch[];
      setBranches(branchList);
      if (branchList.length > 0) {
        setSelectedBranch(branchList[0].id);
      }

      const positions = (posRes.data ?? []) as Position[];
      const mgrPos = positions.find((p) => p.name.toLowerCase() === "manager");
      if (mgrPos) setManagerPosId(mgrPos.id);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRoster = useCallback(async () => {
    if (!selectedBranch || !tenantId || !managerPosId) return;
    setLoading(true);

    const { data: staffData } = await supabase
      .from("staff")
      .select("*")
      .eq("branch_id", selectedBranch)
      .eq("position_id", managerPosId)
      .eq("active", true)
      .order("first_name");

    const mgrList = (staffData ?? []) as Staff[];
    setManagers(mgrList);

    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth(month, year)}`;

    const { data: entries } = await supabase
      .from("roster_entries")
      .select("*, staff!inner(first_name, last_name, position_id, sub_position_id)")
      .eq("branch_id", selectedBranch)
      .eq("staff.position_id", managerPosId)
      .gte("date", startDate)
      .lte("date", endDate);

    const newGrid: Record<string, CellState> = {};
    const entryList = (entries ?? []) as EntryWithStaff[];
    const numDays = daysInMonth(month, year);

    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      for (const mgr of mgrList) {
        newGrid[`${dateStr}_${mgr.id}`] = { start: "", end: "", isLeave: false };
      }
    }

    for (const entry of entryList) {
      const key = `${entry.date}_${entry.staff_id}`;
      if (newGrid[key] !== undefined) {
        newGrid[key] = {
          entryId: entry.id,
          start: fmtTime(entry.shift_start ?? ""),
          end: fmtTime(entry.shift_end ?? ""),
          isLeave: entry.is_off ?? false,
        };
      }
    }

    setGrid(newGrid);
    setLoading(false);
  }, [selectedBranch, tenantId, managerPosId, month, year, supabase]);

  useEffect(() => {
    if (selectedBranch && tenantId && managerPosId) loadRoster();
  }, [selectedBranch, tenantId, managerPosId, month, year, loadRoster]);

  // Save a single cell
  async function handleCellSave(dateStr: string, staffId: string) {
    const key = `${dateStr}_${staffId}`;
    const cell = grid[key];
    if (!cell) return;

    setSaving((prev) => new Set(prev).add(key));
    const hours = cell.isLeave ? 0 : calcHours(cell.start, cell.end);

    await saveRosterEntries([{
      id: cell.entryId,
      staffId,
      date: dateStr,
      shiftStart: cell.isLeave ? undefined : (cell.start || undefined),
      shiftEnd: cell.isLeave ? undefined : (cell.end || undefined),
      shiftHours: hours > 0 ? hours : undefined,
      isOff: cell.isLeave || (!cell.start && !cell.end),
      branchId: selectedBranch,
      tenantId,
    }]);

    if (!cell.entryId) await loadRoster();

    setSaving((prev) => { const n = new Set(prev); n.delete(key); return n; });
    setSaved((prev) => new Set(prev).add(key));
    setTimeout(() => setSaved((prev) => { const n = new Set(prev); n.delete(key); return n; }), 1500);
  }

  // Quick shift — set start/end and save
  function applyQuickShift(dateStr: string, staffId: string, start: string, end: string) {
    const key = `${dateStr}_${staffId}`;
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], start, end, isLeave: false },
    }));
    setTimeout(() => handleCellSave(dateStr, staffId), 50);
  }

  // Toggle leave
  function toggleLeave(dateStr: string, staffId: string) {
    const key = `${dateStr}_${staffId}`;
    setGrid((prev) => {
      const cell = prev[key];
      return {
        ...prev,
        [key]: { ...cell, isLeave: !cell.isLeave, start: "", end: "" },
      };
    });
    setTimeout(() => handleCellSave(dateStr, staffId), 50);
  }

  // Clear cell
  function clearCell(dateStr: string, staffId: string) {
    const key = `${dateStr}_${staffId}`;
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], start: "", end: "", isLeave: false },
    }));
    setTimeout(() => handleCellSave(dateStr, staffId), 50);
  }

  // Pre-fill: apply weekly pattern to entire month for a manager
  async function applyPrefill() {
    if (!prefillMgr) return;
    setBulkSaving(true);

    const numDays = daysInMonth(month, year);
    const entriesToSave: Parameters<typeof saveRosterEntries>[0] = [];
    const updatedGrid = { ...grid };

    for (let d = 1; d <= numDays; d++) {
      const dateObj = new Date(year, month, d);
      const dow = dateObj.getDay();
      const dateStr = toDateStr(dateObj);
      const key = `${dateStr}_${prefillMgr}`;
      const pattern = prefillPattern[dow];

      if (pattern && pattern.start && pattern.end) {
        const hours = calcHours(pattern.start, pattern.end);
        updatedGrid[key] = { ...updatedGrid[key], start: pattern.start, end: pattern.end, isLeave: false };
        entriesToSave.push({
          id: updatedGrid[key]?.entryId,
          staffId: prefillMgr,
          date: dateStr,
          shiftStart: pattern.start,
          shiftEnd: pattern.end,
          shiftHours: hours,
          isOff: false,
          branchId: selectedBranch,
          tenantId,
        });
      } else {
        updatedGrid[key] = { ...updatedGrid[key], start: "", end: "", isLeave: false };
        entriesToSave.push({
          id: updatedGrid[key]?.entryId,
          staffId: prefillMgr,
          date: dateStr,
          isOff: true,
          branchId: selectedBranch,
          tenantId,
        });
      }
    }

    setGrid(updatedGrid);

    // Save in batches of 10
    for (let i = 0; i < entriesToSave.length; i += 10) {
      await saveRosterEntries(entriesToSave.slice(i, i + 10));
    }

    await loadRoster();
    setBulkSaving(false);
    setShowPrefill(false);
  }

  // Build day rows
  const numDays = daysInMonth(month, year);
  const today = toDateStr(now);
  const days: { date: string; dayName: string; dayNum: number; dow: number; isWeekend: boolean; isToday: boolean }[] = [];
  for (let d = 1; d <= numDays; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = toDateStr(dateObj);
    const dow = dateObj.getDay();
    days.push({ date: dateStr, dayName: DAY_NAMES[dow], dayNum: d, dow, isWeekend: dow === 0 || dow === 6, isToday: dateStr === today });
  }

  return (
    <PageShell
      title="Managers Roster"
      subtitle="Set manager schedules — changes auto-apply to the main roster"
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
          {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthNames.map((name, i) => (<option key={i} value={i}>{name}</option>))}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2025, 2026, 2027].map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
        <div className="flex-1" />
        {managers.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => { setShowPrefill(!showPrefill); if (!prefillMgr && managers.length > 0) setPrefillMgr(managers[0].id); }}>
            <Copy size={14} />
            Pre-fill Month
          </Button>
        )}
      </div>

      {/* Pre-fill panel */}
      {showPrefill && (
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <h3 className="text-sm font-bold text-purple-700 mb-3">Pre-fill Weekly Pattern</h3>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold text-purple-500 uppercase mb-1">Manager</label>
              <select className="rounded border border-purple-200 px-2 py-1.5 text-sm bg-white" value={prefillMgr} onChange={(e) => setPrefillMgr(e.target.value)}>
                {managers.map((m) => (<option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 mb-3">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayLabel, i) => {
              const dow = i === 6 ? 0 : i + 1; // Mon=1, Tue=2, ..., Sun=0
              const pat = prefillPattern[dow];
              return (
                <div key={dayLabel} className="text-center">
                  <span className={`block text-[10px] font-bold uppercase mb-1 ${dow === 0 || dow === 6 ? "text-orange-500" : "text-purple-600"}`}>{dayLabel}</span>
                  <select
                    className="w-full text-[11px] border border-purple-200 rounded px-1 py-1 bg-white"
                    value={pat ? `${pat.start}-${pat.end}` : "off"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "off") {
                        setPrefillPattern((prev) => { const n = { ...prev }; delete n[dow]; return n; });
                      } else {
                        const [s, en] = val.split("-");
                        setPrefillPattern((prev) => ({ ...prev, [dow]: { start: s, end: en } }));
                      }
                    }}
                  >
                    <option value="off">OFF</option>
                    <option value="08:00-20:00">08:00–20:00</option>
                    <option value="08:00-14:00">08:00–14:00</option>
                    <option value="14:00-20:00">14:00–20:00</option>
                    <option value="06:00-14:00">06:00–14:00</option>
                    <option value="06:00-18:00">06:00–18:00</option>
                  </select>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={applyPrefill} disabled={bulkSaving}>
              {bulkSaving ? <><Loader2 size={14} className="animate-spin" /> Applying...</> : <>Apply to {monthNames[month]}</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPrefill(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {!loading && managers.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium mb-2">No managers found</p>
          <p className="text-sm">Add staff with the &quot;Manager&quot; position to use this page.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-purple-500" size={24} />
        </div>
      )}

      {/* Table */}
      {!loading && managers.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-purple-600 text-white">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-[45px]">Date</th>
                <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-[40px]">Day</th>
                {managers.map((mgr) => (
                  <th key={mgr.id} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider min-w-[200px]">
                    {mgr.first_name} {mgr.last_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr
                  key={day.date}
                  className={`border-b border-gray-100 ${
                    day.isToday ? "bg-purple-50 ring-1 ring-inset ring-purple-300" : day.isWeekend ? "bg-orange-50/30" : "bg-white"
                  } hover:bg-purple-50/20`}
                >
                  <td className={`px-3 py-1 text-xs font-mono ${day.isToday ? "font-bold text-purple-700" : "text-gray-500"}`}>
                    {day.dayNum}
                  </td>
                  <td className={`px-2 py-1 text-xs font-semibold ${day.isWeekend ? "text-orange-500" : day.isToday ? "text-purple-600" : "text-gray-400"}`}>
                    {day.dayName}
                  </td>
                  {managers.map((mgr) => {
                    const key = `${day.date}_${mgr.id}`;
                    const cell = grid[key];
                    const isSaving = saving.has(key);
                    const isSaved = saved.has(key);

                    if (!cell) return <td key={mgr.id} />;

                    return (
                      <td key={mgr.id} className="px-2 py-0.5">
                        <div className="flex items-center gap-1">
                          {/* Quick shift buttons */}
                          {QUICK_SHIFTS.map((qs) => {
                            const isActive = cell.start === qs.start && cell.end === qs.end && !cell.isLeave;
                            return (
                              <button
                                key={qs.label}
                                onClick={() => applyQuickShift(day.date, mgr.id, qs.start, qs.end)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                                  isActive
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "bg-gray-100 text-gray-500 hover:bg-purple-100 hover:text-purple-600"
                                }`}
                                title={`${qs.start}–${qs.end}`}
                              >
                                {qs.label}
                              </button>
                            );
                          })}

                          {/* Leave button */}
                          <button
                            onClick={() => toggleLeave(day.date, mgr.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                              cell.isLeave
                                ? "bg-amber-500 text-white"
                                : "bg-gray-100 text-gray-400 hover:bg-amber-100 hover:text-amber-600"
                            }`}
                          >
                            Leave
                          </button>

                          {/* Clear */}
                          {(cell.start || cell.end || cell.isLeave) && (
                            <button
                              onClick={() => clearCell(day.date, mgr.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors ml-0.5"
                              title="Clear"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}

                          {/* Status indicator */}
                          {isSaving && <Loader2 size={11} className="animate-spin text-purple-400 ml-0.5" />}
                          {isSaved && <Check size={11} className="text-green-500 ml-0.5" />}

                          {/* Time display */}
                          {cell.start && cell.end && !cell.isLeave && (
                            <span className="text-[10px] font-mono text-purple-500 ml-1">
                              {cell.start}–{cell.end}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-purple-50 border-t-2 border-purple-200">
                <td className="px-3 py-2 text-xs font-bold text-purple-700" colSpan={2}>Total Hours</td>
                {managers.map((mgr) => {
                  let totalHrs = 0;
                  let leaveDays = 0;
                  let workDays = 0;
                  days.forEach((day) => {
                    const cell = grid[`${day.date}_${mgr.id}`];
                    if (cell?.isLeave) leaveDays++;
                    else if (cell?.start && cell?.end) {
                      totalHrs += calcHours(cell.start, cell.end);
                      workDays++;
                    }
                  });
                  return (
                    <td key={mgr.id} className="px-3 py-2 text-center text-xs text-purple-700">
                      <span className="font-bold">{Math.round(totalHrs)}h</span>
                      <span className="text-purple-400 ml-1">({workDays}d work · {leaveDays}d leave)</span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </PageShell>
  );
}
