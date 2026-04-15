"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Branch, Staff, Position } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUSY_DAYS_DEFAULT = [5, 6, 0]; // Fri, Sat, Sun

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface PositionRule {
  positionLabel: string;
  minPerDay: number;
  shiftHours: number;
  daysOn: number;
  daysOff: number;
}

interface GeneratedEntry {
  staffId: string;
  staffName: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  shiftHours: number;
  isOff: boolean;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function addHours(timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const totalMins = h * 60 + (m ?? 0) + Math.round(hours * 60);
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ─── Auto-roster algorithm ────────────────────────────────────────────────────

function generateRoster(params: {
  staff: Staff[];
  year: number;
  month: number;
  positionRules: Record<string, PositionRule>;
  busyDays: number[];
  busyMultiplier: number;
  defaultStart: string;
  positions: Position[];
}): GeneratedEntry[] {
  const { staff, year, month, positionRules, busyDays, busyMultiplier, defaultStart, positions } = params;
  const numDays = daysInMonth(month, year);
  const entries: GeneratedEntry[] = [];

  // Group staff by position label
  const posMap: Record<string, Staff[]> = {};
  for (const s of staff) {
    const pos = positions.find((p) => p.id === s.position_id);
    const label = pos?.name?.toUpperCase() ?? "OTHER";
    if (!posMap[label]) posMap[label] = [];
    posMap[label].push(s);
  }

  // For each position group, apply rotation
  for (const [posLabel, posStaff] of Object.entries(posMap)) {
    const rule = Object.values(positionRules).find(
      (r) => r.positionLabel.toUpperCase() === posLabel
    );
    const shiftHours = rule?.shiftHours ?? 8;
    const minPerDay = rule?.minPerDay ?? 2;
    const daysOn = rule?.daysOn ?? 5;
    const daysOff = rule?.daysOff ?? 1;

    if (posStaff.length === 0) continue;

    // Track each staff member's consecutive work/off days
    const staffState: Array<{ daysWorkedInCycle: number; offDaysLeft: number }> =
      posStaff.map(() => ({ daysWorkedInCycle: 0, offDaysLeft: 0 }));

    for (let day = 1; day <= numDays; day++) {
      const date = toDateStr(year, month, day);
      const dayOfWeek = new Date(year, month, day).getDay();
      const isBusy = busyDays.includes(dayOfWeek);
      const requiredCount = isBusy
        ? Math.ceil(minPerDay * busyMultiplier)
        : minPerDay;

      const available: number[] = [];
      const mustOff: number[] = [];

      // Determine who's available today based on pattern
      for (let i = 0; i < posStaff.length; i++) {
        const state = staffState[i];
        if (state.offDaysLeft > 0) {
          mustOff.push(i);
          state.offDaysLeft -= 1;
        } else {
          available.push(i);
        }
      }

      // If not enough available, take from mustOff (coverage override)
      let working = [...available];
      if (working.length < requiredCount) {
        const needed = requiredCount - working.length;
        const extras = mustOff.splice(0, needed);
        working = [...working, ...extras];
      } else if (working.length > requiredCount) {
        // Rotate: put extras into off cycle
        // Ensure we fairly rotate who gets the day off
        working = working.slice(0, requiredCount);
        const extraOff = available.slice(requiredCount);
        for (const idx of extraOff) {
          if (staffState[idx].daysWorkedInCycle >= daysOn) {
            staffState[idx].offDaysLeft = daysOff;
            staffState[idx].daysWorkedInCycle = 0;
          }
        }
      }

      const workingSet = new Set(working);

      for (let i = 0; i < posStaff.length; i++) {
        const s = posStaff[i];
        const isWorking = workingSet.has(i);

        if (isWorking) {
          const shiftStart = defaultStart;
          const shiftEnd = addHours(shiftStart, shiftHours);
          entries.push({
            staffId: s.id,
            staffName: `${s.first_name} ${s.last_name}`,
            date,
            shiftStart,
            shiftEnd,
            shiftHours,
            isOff: false,
          });
          staffState[i].daysWorkedInCycle += 1;
          if (staffState[i].daysWorkedInCycle >= daysOn) {
            staffState[i].offDaysLeft = daysOff;
            staffState[i].daysWorkedInCycle = 0;
          }
        } else {
          entries.push({
            staffId: s.id,
            staffName: `${s.first_name} ${s.last_name}`,
            date,
            shiftStart: defaultStart,
            shiftEnd: addHours(defaultStart, shiftHours),
            shiftHours: 0,
            isOff: true,
          });
        }
      }
    }
  }

  return entries;
}

// ─── Select class helper ──────────────────────────────────────────────────────

const selectClass = cn(
  "h-9 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
  "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
  "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoRosterPage() {
  const supabase = createClient();
  const router = useRouter();
  const now = new Date();

  // Reference data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Step
  const [step, setStep] = useState<Step>(1);

  // Config
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [month, setMonth] = useState<number>(now.getMonth());
  const [year, setYear] = useState<number>(now.getFullYear());
  const [includedStaff, setIncludedStaff] = useState<Set<string>>(new Set());
  const [busyDays, setBusyDays] = useState<number[]>(BUSY_DAYS_DEFAULT);
  const [busyMultiplier, setBusyMultiplier] = useState<number>(1.5);
  const [defaultStart, setDefaultStart] = useState<string>("08:00");

  // Position rules
  const [positionRules, setPositionRules] = useState<Record<string, PositionRule>>({
    FOH: { positionLabel: "FOH", minPerDay: 3, shiftHours: 6, daysOn: 5, daysOff: 1 },
    BOH: { positionLabel: "BOH", minPerDay: 2, shiftHours: 8, daysOn: 5, daysOff: 2 },
    DRIVER: { positionLabel: "DRIVER", minPerDay: 2, shiftHours: 10, daysOn: 5, daysOff: 2 },
  });

  // Generated entries
  const [generated, setGenerated] = useState<GeneratedEntry[]>([]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overwriteConflict, setOverwriteConflict] = useState(false);
  const [conflictDates, setConflictDates] = useState<string[]>([]);

  // Load reference data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: tid } = await supabase.rpc("get_user_tenant_id");
      if (tid) setTenantId(tid);

      const { data: branchData } = await supabase.from("branches").select("*").order("name");
      if (branchData) {
        setBranches(branchData);
        if (branchData.length > 0) {
          setSelectedBranch(branchData[0].id);
          if (branchData[0].opening_time) {
            setDefaultStart(branchData[0].opening_time.slice(0, 5));
          }
        }
      }

      const { data: posData } = await supabase.from("positions").select("*").order("name");
      if (posData) setPositions(posData);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load staff when branch changes
  useEffect(() => {
    if (!selectedBranch) return;
    async function loadStaff() {
      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("branch_id", selectedBranch)
        .eq("active", true)
        .order("first_name");
      if (data) {
        setAllStaff(data);
        setIncludedStaff(new Set(data.map((s) => s.id)));
      }
    }
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  // Update default start time when branch changes
  useEffect(() => {
    const branch = branches.find((b) => b.id === selectedBranch);
    if (branch?.opening_time) {
      setDefaultStart(branch.opening_time.slice(0, 5));
    }
  }, [selectedBranch, branches]);

  const filteredStaff = useMemo(
    () => allStaff.filter((s) => includedStaff.has(s.id)),
    [allStaff, includedStaff]
  );

  function toggleStaff(id: string) {
    setIncludedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBusyDay(dow: number) {
    setBusyDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]
    );
  }

  function updateRule(key: string, field: keyof PositionRule, value: number | string) {
    setPositionRules((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  function handleGenerate() {
    const entries = generateRoster({
      staff: filteredStaff,
      year,
      month,
      positionRules,
      busyDays,
      busyMultiplier,
      defaultStart,
      positions,
    });
    setGenerated(entries);
    setStep(2);
  }

  // For preview: unique sorted dates and staff
  const previewDates = useMemo(() => {
    const set = new Set(generated.map((e) => e.date));
    return Array.from(set).sort();
  }, [generated]);

  const previewStaff = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const e of generated) {
      if (!seen.has(e.staffId)) {
        seen.add(e.staffId);
        list.push({ id: e.staffId, name: e.staffName });
      }
    }
    return list;
  }, [generated]);

  const entryMap = useMemo(() => {
    const map = new Map<string, GeneratedEntry>();
    for (const e of generated) {
      map.set(`${e.staffId}:${e.date}`, e);
    }
    return map;
  }, [generated]);

  function updateGeneratedEntry(staffId: string, date: string, hours: number) {
    setGenerated((prev) =>
      prev.map((e) =>
        e.staffId === staffId && e.date === date
          ? { ...e, shiftHours: hours, isOff: hours === 0 }
          : e
      )
    );
  }

  const handleSave = useCallback(
    async (overwrite: boolean) => {
      if (!selectedBranch || !tenantId) return;
      setSaving(true);
      setSaveError(null);

      // Check for existing entries in date range
      const startDate = toDateStr(year, month, 1);
      const endDate = toDateStr(year, month, daysInMonth(month, year));

      if (!overwrite) {
        const { data: existing } = await supabase
          .from("roster_entries")
          .select("date")
          .eq("branch_id", selectedBranch)
          .gte("date", startDate)
          .lte("date", endDate);

        if (existing && existing.length > 0) {
          const dates = Array.from(new Set(existing.map((e) => e.date)));
          setConflictDates(dates);
          setOverwriteConflict(true);
          setSaving(false);
          return;
        }
      }

      // Delete existing if overwriting
      if (overwrite) {
        await supabase
          .from("roster_entries")
          .delete()
          .eq("branch_id", selectedBranch)
          .gte("date", startDate)
          .lte("date", endDate);
      }

      // Insert all entries
      const rows = generated
        .filter((e) => !e.isOff || overwrite)
        .map((e) => ({
          staff_id: e.staffId,
          date: e.date,
          shift_start: e.isOff ? null : e.shiftStart,
          shift_end: e.isOff ? null : e.shiftEnd,
          shift_hours: e.isOff ? null : e.shiftHours,
          is_off: e.isOff,
          branch_id: selectedBranch,
          tenant_id: tenantId,
        }));

      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase
          .from("roster_entries")
          .insert(rows.slice(i, i + BATCH));
        if (error) {
          setSaveError(error.message);
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      setStep(3);
      setTimeout(() => router.push("/app/roster"), 2000);
    },
    [generated, selectedBranch, tenantId, year, month, supabase, router]
  );

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i);

  // ─── Step 1: Configuration ─────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-8">
        {/* Branch + Period */}
        <div className="bg-surface border border-base-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Period &amp; Branch</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-base-700 mb-1.5">Branch</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className={cn(selectClass, "w-full")}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-base-700 mb-1.5">Month</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (month === 0) { setMonth(11); setYear(y => y - 1); }
                    else setMonth(m => m - 1);
                  }}
                  className="h-9 w-9 rounded-lg border border-base-200 bg-surface flex items-center justify-center hover:bg-surface-2 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className={cn(selectClass, "flex-1")}
                >
                  {MONTHS.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (month === 11) { setMonth(0); setYear(y => y + 1); }
                    else setMonth(m => m + 1);
                  }}
                  className="h-9 w-9 rounded-lg border border-base-200 bg-surface flex items-center justify-center hover:bg-surface-2 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-base-700 mb-1.5">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={cn(selectClass, "w-full")}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-base-700 mb-1.5">Default Shift Start</label>
            <input
              type="time"
              value={defaultStart}
              onChange={(e) => setDefaultStart(e.target.value)}
              className="h-9 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
        </div>

        {/* Staff selection */}
        <div className="bg-surface border border-base-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Staff</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setIncludedStaff(new Set(allStaff.map((s) => s.id)))}
              >
                Select all
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                className="text-xs text-gray-500 hover:underline"
                onClick={() => setIncludedStaff(new Set())}
              >
                Deselect all
              </button>
            </div>
          </div>

          {allStaff.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No active staff for this branch.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {allStaff.map((s) => {
                const pos = positions.find((p) => p.id === s.position_id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors",
                      includedStaff.has(s.id)
                        ? "border-accent bg-accent/5 text-base-900"
                        : "border-base-200 bg-surface text-gray-400"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={includedStaff.has(s.id)}
                      onChange={() => toggleStaff(s.id)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="truncate">
                      {s.first_name} {s.last_name}
                      {pos && <span className="text-xs text-gray-400 ml-1">({pos.name})</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Position rules */}
        <div className="bg-surface border border-base-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Rules per Position</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 w-28">Position</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Min/Day</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Shift Hrs</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Days On</th>
                  <th className="text-left py-2 font-medium text-gray-500">Days Off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-100">
                {Object.entries(positionRules).map(([key, rule]) => (
                  <tr key={key}>
                    <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-base-700">{key}</td>
                    {(["minPerDay", "shiftHours", "daysOn", "daysOff"] as const).map((field) => (
                      <td key={field} className="py-2.5 pr-4">
                        <input
                          type="number"
                          min={1}
                          max={field === "shiftHours" ? 24 : 31}
                          step={field === "shiftHours" ? 0.5 : 1}
                          value={rule[field] as number}
                          onChange={(e) => updateRule(key, field, parseFloat(e.target.value))}
                          className="h-8 w-20 rounded-lg border border-base-200 bg-surface px-2 text-sm text-base-900 text-center focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Busy days */}
        <div className="bg-surface border border-base-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Busy Days</h2>
          <p className="text-xs text-gray-400">Selected days get extra staff based on the multiplier.</p>

          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, dow) => (
              <button
                key={dow}
                type="button"
                onClick={() => toggleBusyDay(dow)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                  busyDays.includes(dow)
                    ? "border-accent bg-accent text-white"
                    : "border-base-200 bg-surface text-base-600 hover:bg-surface-2"
                )}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-base-700">Multiplier</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={busyMultiplier}
              onChange={(e) => setBusyMultiplier(parseFloat(e.target.value))}
              className="h-8 w-20 rounded-lg border border-base-200 bg-surface px-2 text-sm text-base-900 text-center focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-gray-400">× normal minimum</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={filteredStaff.length === 0 || !selectedBranch}
          >
            Generate Preview
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    );
  }

  // ─── Step 2: Preview ───────────────────────────────────────────────────

  function renderStep2() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Generated <strong>{generated.filter((e) => !e.isOff).length}</strong> work shifts
            across <strong>{previewDates.length}</strong> days for <strong>{previewStaff.length}</strong> staff.
            Click hours to adjust.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setStep(1)}>
            <ChevronLeft size={14} /> Back to Config
          </Button>
        </div>

        <div className="overflow-x-auto border border-base-200 rounded-xl">
          <table className="min-w-max text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-base-200">
                <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 text-left font-medium text-gray-500 min-w-[120px] border-r border-base-200">
                  Date
                </th>
                {previewStaff.map((s) => (
                  <th key={s.id} className="px-2 py-2.5 text-center font-medium text-gray-600 min-w-[80px] whitespace-nowrap">
                    {s.name.split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base-100">
              {previewDates.map((date) => {
                const d = new Date(date + "T00:00:00");
                const dow = d.getDay();
                const isBusy = busyDays.includes(dow);
                return (
                  <tr
                    key={date}
                    className={cn(
                      "hover:bg-surface-2 transition-colors",
                      isBusy && "bg-amber-50/60"
                    )}
                  >
                    <td className={cn(
                      "sticky left-0 z-10 px-3 py-2 font-medium border-r border-base-200",
                      isBusy ? "bg-amber-50" : "bg-surface"
                    )}>
                      <span className="text-base-700">{date.slice(5)}</span>
                      <span className={cn("ml-1.5 text-xs", isBusy ? "text-amber-600 font-semibold" : "text-gray-400")}>
                        {DAY_NAMES[dow]}{isBusy ? " *" : ""}
                      </span>
                    </td>
                    {previewStaff.map((s) => {
                      const entry = entryMap.get(`${s.id}:${date}`);
                      if (!entry) return <td key={s.id} className="px-2 py-2 text-center text-gray-200">—</td>;
                      return (
                        <td key={s.id} className="px-2 py-2 text-center">
                          {entry.isOff ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">OFF</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={entry.shiftHours}
                              onChange={(e) =>
                                updateGeneratedEntry(s.id, date, parseFloat(e.target.value) || 0)
                              }
                              className="w-14 h-7 rounded border border-base-200 text-center text-xs bg-green-50 text-green-800 font-medium focus:outline-none focus:ring-1 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-amber-600">* Busy days highlighted in amber</p>

        {overwriteConflict && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Existing entries found for {conflictDates.length} date(s) in {MONTHS[month]} {year}.
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Would you like to overwrite them or skip conflicting dates?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="danger" size="sm" onClick={() => handleSave(true)}>
                Overwrite All
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {
                setOverwriteConflict(false);
                // Skip: just insert new dates that don't conflict
                handleSaveSkip();
              }}>
                Skip Conflicts
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOverwriteConflict(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setStep(1)}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSave(false)}
            disabled={saving || generated.length === 0}
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Apply to Roster
          </Button>
        </div>
      </div>
    );
  }

  async function handleSaveSkip() {
    if (!selectedBranch || !tenantId) return;
    setSaving(true);
    setSaveError(null);
    setOverwriteConflict(false);

    // Get existing entries' staff+date combos to skip
    const startDate = toDateStr(year, month, 1);
    const endDate = toDateStr(year, month, daysInMonth(month, year));
    const { data: existing } = await supabase
      .from("roster_entries")
      .select("staff_id, date")
      .eq("branch_id", selectedBranch)
      .gte("date", startDate)
      .lte("date", endDate);

    const existingKeys = new Set((existing ?? []).map((e) => `${e.staff_id}:${e.date}`));

    const rows = generated
      .filter((e) => !existingKeys.has(`${e.staffId}:${e.date}`))
      .map((e) => ({
        staff_id: e.staffId,
        date: e.date,
        shift_start: e.isOff ? null : e.shiftStart,
        shift_end: e.isOff ? null : e.shiftEnd,
        shift_hours: e.isOff ? null : e.shiftHours,
        is_off: e.isOff,
        branch_id: selectedBranch,
        tenant_id: tenantId,
      }));

    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from("roster_entries").insert(rows.slice(i, i + BATCH));
      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setStep(3);
    setTimeout(() => router.push("/app/roster"), 2000);
  }

  // ─── Step 3: Done ─────────────────────────────────────────────────────

  function renderStep3() {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <CheckCircle2 size={48} className="text-green-500" />
        <h2 className="text-lg font-semibold text-base-900">Roster Applied!</h2>
        <p className="text-sm text-gray-500">Redirecting to Roster...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <PageShell title="Auto-Roster Generator">
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-gray-300" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Auto-Roster Generator"
      subtitle={`${MONTHS[month]} ${year}`}
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                step >= s
                  ? "bg-accent text-white"
                  : "bg-base-200 text-gray-400"
              )}
            >
              {s}
            </div>
            <span className={cn("text-sm hidden sm:block", step >= s ? "text-base-900 font-medium" : "text-gray-400")}>
              {s === 1 ? "Configure" : s === 2 ? "Preview" : "Done"}
            </span>
            {s < 3 && <div className="w-8 h-px bg-base-200 mx-1" />}
          </div>
        ))}
      </div>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </PageShell>
  );
}
