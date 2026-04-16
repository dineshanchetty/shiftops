"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { saveRosterEntries } from "@/app/app/roster/actions";
import { Check, Loader2 } from "lucide-react";
import type { Branch, Position, Staff, RosterEntry } from "@/lib/types";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

// Cell state for a single manager on a single day
interface CellState {
  entryId?: string;
  start: string; // "08:00" or ""
  end: string;   // "20:00" or ""
  isLeave: boolean;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const [saving, setSaving] = useState<string | null>(null); // "date-staffId"
  const [saved, setSaved] = useState<string | null>(null);

  // Grid data: { "2026-05-01_staffId": CellState }
  const [grid, setGrid] = useState<Record<string, CellState>>({});

  // Month options
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
      if (branchList.length > 0 && !selectedBranch) {
        setSelectedBranch(branchList[0].id);
      }

      const positions = (posRes.data ?? []) as Position[];
      const mgrPos = positions.find((p) => p.name.toLowerCase() === "manager");
      if (mgrPos) {
        setManagerPosId(mgrPos.id);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load managers and roster entries when branch/month changes
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

    // Get existing roster entries for this month
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth(month, year)}`;

    const { data: entries } = await supabase
      .from("roster_entries")
      .select("*, staff!inner(first_name, last_name, position_id, sub_position_id)")
      .eq("branch_id", selectedBranch)
      .eq("staff.position_id", managerPosId)
      .gte("date", startDate)
      .lte("date", endDate);

    // Build grid
    const newGrid: Record<string, CellState> = {};
    const entryList = (entries ?? []) as EntryWithStaff[];

    // Initialize all cells as empty
    const numDays = daysInMonth(month, year);
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      for (const mgr of mgrList) {
        const key = `${dateStr}_${mgr.id}`;
        newGrid[key] = { start: "", end: "", isLeave: false };
      }
    }

    // Fill from existing entries
    for (const entry of entryList) {
      const key = `${entry.date}_${entry.staff_id}`;
      if (newGrid[key] !== undefined) {
        newGrid[key] = {
          entryId: entry.id,
          start: entry.shift_start?.slice(0, 5) ?? "",
          end: entry.shift_end?.slice(0, 5) ?? "",
          isLeave: entry.is_off ?? false,
        };
      }
    }

    setGrid(newGrid);
    setLoading(false);
  }, [selectedBranch, tenantId, managerPosId, month, year, supabase]);

  useEffect(() => {
    if (selectedBranch && tenantId && managerPosId) {
      loadRoster();
    }
  }, [selectedBranch, tenantId, managerPosId, month, year, loadRoster]);

  // Auto-save a cell when it changes
  async function handleCellSave(dateStr: string, staffId: string) {
    const key = `${dateStr}_${staffId}`;
    const cell = grid[key];
    if (!cell) return;

    const saveKey = key;
    setSaving(saveKey);

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

    // If no entryId, reload to get it
    if (!cell.entryId) {
      await loadRoster();
    }

    setSaving(null);
    setSaved(saveKey);
    setTimeout(() => setSaved(null), 1500);
  }

  function updateCell(dateStr: string, staffId: string, field: "start" | "end", value: string) {
    const key = `${dateStr}_${staffId}`;
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value, isLeave: false },
    }));
  }

  function toggleLeave(dateStr: string, staffId: string) {
    const key = `${dateStr}_${staffId}`;
    setGrid((prev) => {
      const cell = prev[key];
      const newLeave = !cell.isLeave;
      return {
        ...prev,
        [key]: { ...cell, isLeave: newLeave, start: newLeave ? "" : cell.start, end: newLeave ? "" : cell.end },
      };
    });
    // Auto-save after toggling
    setTimeout(() => handleCellSave(dateStr, staffId), 100);
  }

  // Build day rows
  const numDays = daysInMonth(month, year);
  const today = toDateStr(now);
  const days: { date: string; dayName: string; dayNum: number; isWeekend: boolean; isToday: boolean }[] = [];
  for (let d = 1; d <= numDays; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = toDateStr(dateObj);
    const dow = dateObj.getDay();
    days.push({
      date: dateStr,
      dayName: DAY_NAMES[dow],
      dayNum: d,
      isWeekend: dow === 0 || dow === 6,
      isToday: dateStr === today,
    });
  }

  return (
    <PageShell
      title="Managers Roster"
      subtitle="Set manager schedules — changes auto-apply to the main roster"
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {monthNames.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>

        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* No managers message */}
      {!loading && managers.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium mb-2">No managers found</p>
          <p className="text-sm">Add staff with the &quot;Manager&quot; position to use this page.</p>
        </div>
      )}

      {/* Loading */}
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
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-[50px]">Date</th>
                <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-[50px]">Day</th>
                {managers.map((mgr) => (
                  <th key={mgr.id} colSpan={2} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                    {mgr.first_name} {mgr.last_name?.[0]}.
                  </th>
                ))}
              </tr>
              <tr className="bg-purple-500/90 text-white/80">
                <th className="px-3 py-1" />
                <th className="px-2 py-1" />
                {managers.map((mgr) => (
                  <th key={`${mgr.id}-sub`} colSpan={2} className="px-2 py-1 text-[10px] font-normal tracking-wide">
                    Start – End
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr
                  key={day.date}
                  className={`border-b border-gray-100 transition-colors ${
                    day.isToday ? "bg-purple-50 font-semibold" : day.isWeekend ? "bg-gray-50/50" : "bg-white"
                  } hover:bg-purple-50/30`}
                >
                  <td className="px-3 py-1.5 text-xs font-mono text-gray-600">{day.dayNum}</td>
                  <td className={`px-2 py-1.5 text-xs font-medium ${day.isWeekend ? "text-orange-500" : "text-gray-500"}`}>
                    {day.dayName}
                  </td>
                  {managers.map((mgr) => {
                    const key = `${day.date}_${mgr.id}`;
                    const cell = grid[key];
                    const isSaving = saving === key;
                    const isSaved = saved === key;

                    if (!cell) return <td key={mgr.id} colSpan={2} />;

                    if (cell.isLeave) {
                      return (
                        <td key={mgr.id} colSpan={2} className="px-2 py-1 text-center">
                          <button
                            onClick={() => toggleLeave(day.date, mgr.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide hover:bg-amber-200 transition-colors"
                          >
                            LEAVE
                            {isSaving && <Loader2 size={10} className="animate-spin" />}
                            {isSaved && <Check size={10} className="text-green-600" />}
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td key={mgr.id} colSpan={2} className="px-1 py-0.5">
                        <div className="flex items-center gap-0.5">
                          <input
                            type="time"
                            className="w-[72px] text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:ring-1 focus:ring-purple-300 focus:border-purple-400 outline-none"
                            value={cell.start}
                            onChange={(e) => updateCell(day.date, mgr.id, "start", e.target.value)}
                            onBlur={() => { if (cell.start && cell.end) handleCellSave(day.date, mgr.id); }}
                          />
                          <span className="text-gray-300 text-[10px]">–</span>
                          <input
                            type="time"
                            className="w-[72px] text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:ring-1 focus:ring-purple-300 focus:border-purple-400 outline-none"
                            value={cell.end}
                            onChange={(e) => updateCell(day.date, mgr.id, "end", e.target.value)}
                            onBlur={() => { if (cell.start && cell.end) handleCellSave(day.date, mgr.id); }}
                          />
                          <button
                            onClick={() => toggleLeave(day.date, mgr.id)}
                            className="text-[8px] text-gray-400 hover:text-amber-600 px-0.5"
                            title="Mark as leave"
                          >
                            L
                          </button>
                          {isSaving && <Loader2 size={10} className="animate-spin text-purple-500" />}
                          {isSaved && <Check size={10} className="text-green-500" />}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {/* Footer: Total hours */}
            <tfoot>
              <tr className="bg-purple-50 border-t-2 border-purple-200 font-semibold">
                <td className="px-3 py-2 text-xs text-purple-700" colSpan={2}>Total Hours</td>
                {managers.map((mgr) => {
                  let total = 0;
                  days.forEach((day) => {
                    const cell = grid[`${day.date}_${mgr.id}`];
                    if (cell && !cell.isLeave && cell.start && cell.end) {
                      total += calcHours(cell.start, cell.end);
                    }
                  });
                  return (
                    <td key={mgr.id} colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-700">
                      {Math.round(total)}h
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
