"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { FilterBar, type RosterFilters } from "@/components/roster/filter-bar";
import { CalendarGrid } from "@/components/roster/calendar-grid";
import { RosterSummary } from "@/components/roster/roster-summary";
import { ShiftEditor } from "@/components/roster/shift-editor";
import { getRosterEntries, saveRosterEntries, deleteRosterEntry } from "./actions";
import { exportRosterPdf } from "./export-pdf";
import { FileDown, Wand2 } from "lucide-react";
import Link from "next/link";
import type { Branch, Position, SubPosition, Staff, RosterEntry } from "@/lib/types";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export default function RosterPage() {
  const supabase = createClient();
  const now = new Date();

  // Reference data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [subPositions, setSubPositions] = useState<SubPosition[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [branchName, setBranchName] = useState<string>("");

  // Selected branch operations data
  const [selectedBranchData, setSelectedBranchData] = useState<Branch | null>(null);

  // Shift templates for selected branch (for the dropdown on each staff row)
  // Last-year same-DOW summary keyed by current-year date string (for ghost roster)
  const [prevYearByDate, setPrevYearByDate] = useState<Map<string, {
    date: string;
    prevDate: string;
    totalHours: number;
    prevYrTurnover: number | null;
    perStaff: { staff_id: string; first_name: string; last_name: string; hours: number }[];
  }>>(new Map());

  const [shiftTemplates, setShiftTemplates] = useState<Array<{
    id: string; name: string; shift_start: string; shift_end: string; is_active: boolean;
  }>>([]);

  // Roster data
  const [entries, setEntries] = useState<EntryWithStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filters, setFilters] = useState<RosterFilters>({
    branchId: "",
    positionId: "",
    subPositionId: "",
    month: now.getMonth(),
    year: now.getFullYear(),
    startDay: 1,
    endDay: daysInMonth(now.getMonth(), now.getFullYear()),
  });

  // Shift editor state
  const [editorDate, setEditorDate] = useState<string | null>(null);

  // Computed date range
  const dateRange = useMemo(() => {
    const start = new Date(filters.year, filters.month, filters.startDay);
    const maxDay = daysInMonth(filters.month, filters.year);
    const end = new Date(
      filters.year,
      filters.month,
      Math.min(filters.endDay, maxDay)
    );
    return { start, end };
  }, [filters.year, filters.month, filters.startDay, filters.endDay]);

  // Date strings for queries
  const startDateStr = useMemo(() => {
    const d = dateRange.start;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [dateRange.start]);

  const endDateStr = useMemo(() => {
    const d = dateRange.end;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [dateRange.end]);

  // Load reference data on mount
  useEffect(() => {
    async function loadReferenceData() {
      // Get tenant ID
      const { data: tid } = await supabase.rpc("get_user_tenant_id");
      if (tid) setTenantId(tid);

      // Get branches
      const { data: branchData } = await supabase
        .from("branches")
        .select("*")
        .order("name");
      if (branchData) {
        setBranches(branchData);
        if (branchData.length > 0 && !filters.branchId) {
          setFilters((prev) => ({ ...prev, branchId: branchData[0].id }));
          setBranchName(branchData[0].name);
        }
      }

      // Get positions
      const { data: posData } = await supabase
        .from("positions")
        .select("*")
        .order("name");
      if (posData) setPositions(posData);

      // Get sub-positions
      const { data: subPosData } = await supabase
        .from("sub_positions")
        .select("*")
        .order("name");
      if (subPosData) setSubPositions(subPosData);
    }

    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load staff for the selected branch
  useEffect(() => {
    async function loadStaff() {
      if (!filters.branchId) {
        setStaff([]);
        return;
      }

      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("branch_id", filters.branchId)
        .eq("active", true)
        .order("first_name");
      if (data) setStaff(data);
    }

    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.branchId]);

  // Update branch name and fetch full branch data when branch changes
  useEffect(() => {
    const branch = branches.find((b) => b.id === filters.branchId);
    setBranchName(branch?.name ?? "");

    async function loadBranchData() {
      if (!filters.branchId) {
        setSelectedBranchData(null);
        setShiftTemplates([]);
        return;
      }
      const [branchRes, templatesRes] = await Promise.all([
        supabase.from("branches").select("*").eq("id", filters.branchId).single(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("shift_templates")
          .select("id, name, shift_start, shift_end, is_active")
          .eq("branch_id", filters.branchId)
          .eq("is_active", true)
          .order("shift_start"),
      ]);
      if (branchRes.data) setSelectedBranchData(branchRes.data);
      setShiftTemplates(templatesRes.data ?? []);
    }
    loadBranchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.branchId, branches]);

  // Load roster entries
  const loadEntries = useCallback(async () => {
    if (!filters.branchId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await getRosterEntries(
      filters.branchId,
      startDateStr,
      endDateStr,
      filters.positionId || undefined,
      filters.subPositionId || undefined
    );

    if (!error && data) {
      setEntries(data);
    }
    setLoading(false);
  }, [filters.branchId, filters.positionId, filters.subPositionId, startDateStr, endDateStr]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Load last-year same-DOW data for ghost roster overlay
  useEffect(() => {
    if (!filters.branchId) {
      setPrevYearByDate(new Map());
      return;
    }
    (async () => {
      // Compute prev-year date range = current month range shifted back 364 days
      const shift = (d: string) => {
        const x = new Date(d + "T00:00:00Z");
        x.setUTCDate(x.getUTCDate() - 364);
        return x.toISOString().split("T")[0];
      };
      const prevStart = shift(startDateStr);
      const prevEnd = shift(endDateStr);

      // Pull roster_entries (with staff names) + daily_cashups gross_turnover for that prev-year range
      const [rosterRes, cashupRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("roster_entries")
          .select("date, staff_id, shift_hours, is_off, staff!inner(first_name, last_name)")
          .eq("branch_id", filters.branchId)
          .gte("date", prevStart)
          .lte("date", prevEnd),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("daily_cashups")
          .select("date, gross_turnover")
          .eq("branch_id", filters.branchId)
          .gte("date", prevStart)
          .lte("date", prevEnd),
      ]);

      // Build map: prev-year date → { totalHours, perStaff[], turnover }
      const byPrevDate = new Map<string, { totalHours: number; perStaff: { staff_id: string; first_name: string; last_name: string; hours: number }[] }>();
      for (const r of (rosterRes.data ?? []) as Array<{ date: string; staff_id: string; shift_hours: number | null; is_off: boolean | null; staff: { first_name: string; last_name: string } | null }>) {
        if (r.is_off || !r.shift_hours) continue;
        const cur = byPrevDate.get(r.date) ?? { totalHours: 0, perStaff: [] };
        cur.totalHours += r.shift_hours;
        if (r.staff) {
          cur.perStaff.push({ staff_id: r.staff_id, first_name: r.staff.first_name, last_name: r.staff.last_name, hours: r.shift_hours });
        }
        byPrevDate.set(r.date, cur);
      }
      const turnoverByPrevDate = new Map<string, number>();
      for (const c of (cashupRes.data ?? []) as Array<{ date: string; gross_turnover: number | null }>) {
        if (c.gross_turnover != null) turnoverByPrevDate.set(c.date, c.gross_turnover);
      }

      // Re-key by current-year date
      const result = new Map<string, { date: string; prevDate: string; totalHours: number; prevYrTurnover: number | null; perStaff: { staff_id: string; first_name: string; last_name: string; hours: number }[] }>();
      const cur = new Date(startDateStr + "T00:00:00Z");
      const end = new Date(endDateStr + "T00:00:00Z");
      while (cur <= end) {
        const curStr = cur.toISOString().split("T")[0];
        const prevStr = shift(curStr);
        const prevData = byPrevDate.get(prevStr);
        const prevTurnover = turnoverByPrevDate.get(prevStr) ?? null;
        if (prevData || prevTurnover != null) {
          result.set(curStr, {
            date: curStr,
            prevDate: prevStr,
            totalHours: prevData?.totalHours ?? 0,
            prevYrTurnover: prevTurnover,
            perStaff: (prevData?.perStaff ?? []).sort((a, b) => b.hours - a.hours),
          });
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      setPrevYearByDate(result);
    })();
  }, [filters.branchId, startDateStr, endDateStr, supabase]);

  // Total scheduled hours
  const totalScheduledHours = useMemo(
    () =>
      entries.reduce(
        (sum, e) => sum + (e.is_off ? 0 : (e.shift_hours ?? 0)),
        0
      ),
    [entries]
  );

  // Unique staff count (excluding OFF-only)
  const uniqueStaffCount = useMemo(() => {
    const staffIds = new Set<string>();
    for (const e of entries) {
      if (!e.is_off) staffIds.add(e.staff_id);
    }
    return staffIds.size;
  }, [entries]);

  // Entries for the editor date
  const editorEntries = useMemo(
    () => (editorDate ? entries.filter((e) => e.date === editorDate) : []),
    [entries, editorDate]
  );

  // Handle shift editor save
  async function handleShiftSave(
    entriesToSave: {
      id?: string;
      staffId: string;
      date: string;
      shiftStart?: string;
      shiftEnd?: string;
      shiftHours?: number;
      isOff: boolean;
      branchId: string;
      tenantId: string;
    }[],
    deleteIds: string[]
  ) {
    // Delete removed entries
    for (const id of deleteIds) {
      await deleteRosterEntry(id);
    }

    // Save new/updated entries
    if (entriesToSave.length > 0) {
      await saveRosterEntries(entriesToSave);
    }

    // Refresh and close
    await loadEntries();
    setEditorDate(null);
  }

  function handleExportPdf() {
    exportRosterPdf(entries, branchName || "All Branches", dateRange);
  }

  return (
    <PageShell
      title="Roster"
      action={
        <div className="flex items-center gap-2">
          <Link href="/app/roster/auto-roster">
            <Button variant="secondary" size="sm">
              <Wand2 size={16} />
              Auto-Roster
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={handleExportPdf}>
            <FileDown size={16} />
            Export PDF
          </Button>
        </div>
      }
    >
      {/* Filter Bar — sticky so calendar scrolls underneath */}
      <div className="sticky top-0 z-10 bg-gray-50 pb-3 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 pt-1">
        <FilterBar
          branches={branches}
          positions={positions}
          subPositions={subPositions}
          filters={filters}
          onFilterChange={setFilters}
        />

        {/* Summary */}
        <div className="mt-3">
          <RosterSummary totalScheduledHours={totalScheduledHours} staffCount={uniqueStaffCount} />
        </div>
      </div>

      {/* Calendar Grid */}
      <CalendarGrid
        entries={entries}
        staff={staff}
        positions={positions}
        shiftTemplates={shiftTemplates}
        prevYearByDate={prevYearByDate}
        dateRange={dateRange}
        onDateClick={(date) => setEditorDate(date)}
        loading={loading}
        workingDays={selectedBranchData?.working_days ?? undefined}
        openingTime={selectedBranchData?.opening_time ? selectedBranchData.opening_time.slice(0, 5) : undefined}
        closingTime={selectedBranchData?.closing_time ? selectedBranchData.closing_time.slice(0, 5) : undefined}
        branchId={filters.branchId}
        tenantId={tenantId}
        onEntryUpdated={loadEntries}
      />

      {/* Shift Editor slide-over */}
      {editorDate && filters.branchId && (
        <ShiftEditor
          date={editorDate}
          branchId={filters.branchId}
          tenantId={tenantId}
          entries={editorEntries}
          staff={staff}
          positions={positions}
          defaultStartTime={selectedBranchData?.opening_time ? selectedBranchData.opening_time.slice(0, 5) : undefined}
          defaultEndTime={selectedBranchData?.closing_time ? selectedBranchData.closing_time.slice(0, 5) : undefined}
          onSave={handleShiftSave}
          onClose={() => setEditorDate(null)}
        />
      )}
    </PageShell>
  );
}
