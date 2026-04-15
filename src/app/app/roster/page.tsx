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
        return;
      }
      const { data } = await supabase
        .from("branches")
        .select("*")
        .eq("id", filters.branchId)
        .single();
      if (data) setSelectedBranchData(data);
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
        dateRange={dateRange}
        onDateClick={(date) => setEditorDate(date)}
        loading={loading}
        workingDays={selectedBranchData?.working_days ?? undefined}
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
