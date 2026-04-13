"use client";

import { useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { ClipboardList } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hoursToHHMM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtNeg(amount: number): string {
  if (amount < 0) {
    return `(R ${Math.abs(amount).toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`;
  }
  return formatCurrency(amount);
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface StaffInfo {
  id: string;
  name: string;
  positionId: string;
  positionName: string;
  positionCategory: string; // FOH or BOH
}

interface DateRow {
  date: Date;
  dayName: string;
  dateFormatted: string;
  hoursMap: Map<string, number>; // staffId -> hours
  totalHours: number;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BudgetRosterPage() {
  const supabase = createClient();
  const [dateRows, setDateRows] = useState<DateRow[]>([]);
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hideNonRostered, setHideNonRostered] = useState(false);
  const [summaryStats, setSummaryStats] = useState({
    actualWageTotal: 0,
    budgetWageTotal: 0,
    prevYearNettTO: 0,
    actualNettTO: 0,
    budgetNettTO: 0,
  });

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const [
        { data: entries },
        { data: staffRows },
        { data: positions },
        { data: cashups },
      ] = await Promise.all([
        supabase
          .from("roster_entries")
          .select("*")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo),
        supabase.from("staff").select("id, first_name, last_name, position_id"),
        supabase.from("positions").select("id, name"),
        supabase
          .from("daily_cashups")
          .select("gross_turnover")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo),
      ]);

      const posMap = new Map(
        (positions ?? []).map((p) => [
          p.id,
          { name: p.name as string },
        ])
      );

      // Build staff info list — only staff with roster entries
      const staffWithEntries = new Set<string>();
      if (entries) {
        for (const e of entries) {
          staffWithEntries.add(e.staff_id);
        }
      }

      const allStaff: StaffInfo[] = (staffRows ?? [])
        .filter((s) => staffWithEntries.has(s.id))
        .map((s) => {
          const pos = posMap.get(s.position_id ?? "");
          const posName = pos?.name ?? "N/A";
          // Infer category from position name
          const nameLower = posName.toLowerCase();
          const isBOH =
            nameLower.includes("kitchen") ||
            nameLower.includes("chef") ||
            nameLower.includes("cook") ||
            nameLower.includes("boh") ||
            nameLower.includes("back of house") ||
            nameLower.includes("prep");
          return {
            id: s.id,
            name: `${s.first_name} ${s.last_name}`,
            positionId: s.position_id ?? "",
            positionName: posName,
            positionCategory: isBOH ? "BOH" : "FOH",
          };
        })
        .sort((a, b) => {
          // FOH first, then BOH; within category, alphabetical
          if (a.positionCategory !== b.positionCategory) {
            return a.positionCategory === "FOH" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      setStaffList(allStaff);

      // Build entry lookup: date+staffId -> hours
      const entryLookup = new Map<string, number>();
      if (entries) {
        for (const e of entries) {
          const key = `${e.date}|${e.staff_id}`;
          const hours = e.is_off ? 0 : (e.shift_hours ?? 0);
          entryLookup.set(key, (entryLookup.get(key) ?? 0) + hours);
        }
      }

      // Generate all dates in the range
      const fromDate = new Date(f.dateFrom + "T00:00:00");
      const toDate = new Date(f.dateTo + "T00:00:00");
      const rows: DateRow[] = [];
      const current = new Date(fromDate);

      while (current <= toDate) {
        const iso = toISODate(current);
        const hoursMap = new Map<string, number>();
        let totalHours = 0;

        for (const staff of allStaff) {
          const key = `${iso}|${staff.id}`;
          const hours = entryLookup.get(key) ?? 0;
          hoursMap.set(staff.id, hours);
          totalHours += hours;
        }

        rows.push({
          date: new Date(current),
          dayName: DAY_NAMES[current.getDay()],
          dateFormatted: fmtDateShort(current),
          hoursMap,
          totalHours,
        });

        current.setDate(current.getDate() + 1);
      }

      setDateRows(rows);

      // Compute summary
      const actualTO = (cashups ?? []).reduce(
        (s, c) => s + (c.gross_turnover ?? 0),
        0
      );
      const totalDays = rows.length;
      const budgetTO = totalDays * 15000; // default budget
      const totalRosteredHours = rows.reduce((s, r) => s + r.totalHours, 0);
      const avgHourlyRate = 45; // default rate
      const actualWages = totalRosteredHours * avgHourlyRate;
      const budgetWages = budgetTO * 0.28;

      setSummaryStats({
        actualWageTotal: actualWages,
        budgetWageTotal: budgetWages,
        prevYearNettTO: 0,
        actualNettTO: actualTO,
        budgetNettTO: budgetTO,
      });

      setLoading(false);
    },
    [supabase]
  );

  // Determine which staff to show
  const visibleStaff = useMemo(() => {
    if (!hideNonRostered) return staffList;
    // Filter to staff who have at least one non-zero entry
    return staffList.filter((s) =>
      dateRows.some((r) => (r.hoursMap.get(s.id) ?? 0) > 0)
    );
  }, [staffList, dateRows, hideNonRostered]);

  // Group staff by category for headers
  const fohStaff = visibleStaff.filter(
    (s) => s.positionCategory === "FOH"
  );
  const bohStaff = visibleStaff.filter(
    (s) => s.positionCategory !== "FOH"
  );

  // Staff totals (bottom row)
  const staffTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of visibleStaff) {
      let total = 0;
      for (const row of dateRows) {
        total += row.hoursMap.get(s.id) ?? 0;
      }
      totals.set(s.id, total);
    }
    return totals;
  }, [visibleStaff, dateRows]);

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Day",
      "Date",
      ...visibleStaff.map((s) => s.name),
      "Total Hours",
    ];
    const csvRows = dateRows.map((r) => [
      r.dayName,
      r.dateFormatted,
      ...visibleStaff.map((s) =>
        hoursToHHMM(r.hoursMap.get(s.id) ?? 0)
      ),
      hoursToHHMM(r.totalHours),
    ]);
    // Add totals row
    csvRows.push([
      "",
      "Totals",
      ...visibleStaff.map((s) =>
        hoursToHHMM(staffTotals.get(s.id) ?? 0)
      ),
      hoursToHHMM(dateRows.reduce((s, r) => s + r.totalHours, 0)),
    ]);
    triggerDownload(
      generateCSV(headers, csvRows),
      "budget-roster-report.csv",
      "text/csv"
    );
  }, [dateRows, visibleStaff, staffTotals]);

  const wageDiff =
    summaryStats.actualWageTotal - summaryStats.budgetWageTotal;
  const toDiff = summaryStats.actualNettTO - summaryStats.budgetNettTO;
  const actualWagesPct =
    summaryStats.actualNettTO > 0
      ? (summaryStats.actualWageTotal / summaryStats.actualNettTO) * 100
      : 0;
  const budgetWagesPct =
    summaryStats.budgetNettTO > 0
      ? (summaryStats.budgetWageTotal / summaryStats.budgetNettTO) * 100
      : 0;

  return (
    <ReportWrapper
      title="Budget Roster Report"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Controls */}
      <div className="flex items-center gap-4 mb-4 print:hidden">
        <label className="flex items-center gap-2 text-sm text-base-700 cursor-pointer">
          <input
            type="checkbox"
            checked={hideNonRostered}
            onChange={(e) => setHideNonRostered(e.target.checked)}
            className="rounded border-base-300"
          />
          Hide Non-Rostered
        </label>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && dateRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <ClipboardList className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Pivot Table */}
      {!loading && dateRows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="text-sm whitespace-nowrap">
              {/* Column group headers: Day | Date | FOH ... | BOH ... | Total */}
              <thead>
                {/* Category header row */}
                <tr className="bg-surface-2 border-b border-base-200">
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5" />
                  {fohStaff.length > 0 && (
                    <th
                      colSpan={fohStaff.length}
                      className="px-2 py-1.5 text-center text-xs uppercase tracking-wide font-bold text-blue-600 border-l border-base-200"
                    >
                      FRONT OF HOUSE
                    </th>
                  )}
                  {bohStaff.length > 0 && (
                    <th
                      colSpan={bohStaff.length}
                      className="px-2 py-1.5 text-center text-xs uppercase tracking-wide font-bold text-orange-600 border-l border-base-200"
                    >
                      BACK OF HOUSE
                    </th>
                  )}
                  <th className="px-2 py-1.5 border-l border-base-200" />
                </tr>

                {/* Staff name header row */}
                <tr className="bg-surface-2">
                  <th className="px-2 py-1.5 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky left-0 bg-surface-2 z-10">
                    Day
                  </th>
                  <th className="px-2 py-1.5 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky left-[3rem] bg-surface-2 z-10">
                    Date
                  </th>
                  {fohStaff.map((s, i) => (
                    <th
                      key={s.id}
                      className={cn(
                        "px-2 py-1.5 text-xs font-semibold text-base-500 text-center min-w-[60px]",
                        i === 0 && "border-l border-base-200"
                      )}
                      title={s.positionName}
                    >
                      <div className="truncate max-w-[80px]">
                        {s.name.split(" ")[0]}
                      </div>
                    </th>
                  ))}
                  {bohStaff.map((s, i) => (
                    <th
                      key={s.id}
                      className={cn(
                        "px-2 py-1.5 text-xs font-semibold text-base-500 text-center min-w-[60px]",
                        i === 0 && "border-l border-base-200"
                      )}
                      title={s.positionName}
                    >
                      <div className="truncate max-w-[80px]">
                        {s.name.split(" ")[0]}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-xs uppercase tracking-wide font-semibold text-base-400 text-center border-l border-base-200">
                    Total Hours
                  </th>
                </tr>
              </thead>
              <tbody>
                {dateRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-2 py-1 text-base-900 sticky left-0 bg-surface z-10">
                      {row.dayName}
                    </td>
                    <td className="px-2 py-1 text-base-900 sticky left-[3rem] bg-surface z-10">
                      {row.dateFormatted}
                    </td>
                    {fohStaff.map((s, i) => {
                      const hours = row.hoursMap.get(s.id) ?? 0;
                      return (
                        <td
                          key={s.id}
                          className={cn(
                            "px-2 py-1 text-center font-mono text-base-700",
                            i === 0 && "border-l border-base-200",
                            hours === 0 && "text-base-300"
                          )}
                        >
                          {hoursToHHMM(hours)}
                        </td>
                      );
                    })}
                    {bohStaff.map((s, i) => {
                      const hours = row.hoursMap.get(s.id) ?? 0;
                      return (
                        <td
                          key={s.id}
                          className={cn(
                            "px-2 py-1 text-center font-mono text-base-700",
                            i === 0 && "border-l border-base-200",
                            hours === 0 && "text-base-300"
                          )}
                        >
                          {hoursToHHMM(hours)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-mono font-semibold text-base-900 border-l border-base-200">
                      {hoursToHHMM(row.totalHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-2 py-2 text-base-900 sticky left-0 bg-surface-2 z-10">
                    Totals
                  </td>
                  <td className="px-2 py-2 sticky left-[3rem] bg-surface-2 z-10" />
                  {fohStaff.map((s, i) => (
                    <td
                      key={s.id}
                      className={cn(
                        "px-2 py-2 text-center font-mono text-base-900",
                        i === 0 && "border-l border-base-200"
                      )}
                    >
                      {hoursToHHMM(staffTotals.get(s.id) ?? 0)}
                    </td>
                  ))}
                  {bohStaff.map((s, i) => (
                    <td
                      key={s.id}
                      className={cn(
                        "px-2 py-2 text-center font-mono text-base-900",
                        i === 0 && "border-l border-base-200"
                      )}
                    >
                      {hoursToHHMM(staffTotals.get(s.id) ?? 0)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono font-bold text-base-900 border-l border-base-200">
                    {hoursToHHMM(
                      dateRows.reduce((s, r) => s + r.totalHours, 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary stats block */}
          <div className="mt-6 rounded-lg border border-base-200 bg-surface p-4">
            <h3 className="text-sm font-semibold text-base-700 mb-3 uppercase tracking-wide">
              Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-base-500">Actual Wage Total</span>
                <span className="font-mono text-base-900">
                  {formatCurrency(summaryStats.actualWageTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Budget Wage Total</span>
                <span className="font-mono text-base-900">
                  {formatCurrency(summaryStats.budgetWageTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Wage Difference</span>
                <span
                  className={cn(
                    "font-mono font-semibold",
                    wageDiff < 0 ? "text-red-600" : "text-base-900"
                  )}
                >
                  {fmtNeg(wageDiff)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Previous Year Nett T/O</span>
                <span className="font-mono text-base-900">
                  {formatCurrency(summaryStats.prevYearNettTO)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Actual Nett Turnover</span>
                <span className="font-mono text-base-900">
                  {formatCurrency(summaryStats.actualNettTO)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Budget Nett Turnover</span>
                <span className="font-mono text-base-900">
                  {formatCurrency(summaryStats.budgetNettTO)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Turnover Difference</span>
                <span
                  className={cn(
                    "font-mono font-semibold",
                    toDiff < 0 ? "text-red-600" : "text-base-900"
                  )}
                >
                  {fmtNeg(toDiff)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">
                  Actual Wages % Of Turnover
                </span>
                <span className="font-mono text-base-900">
                  {actualWagesPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">
                  Budget Wages % Of Turnover
                </span>
                <span className="font-mono text-base-900">
                  {budgetWagesPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </ReportWrapper>
  );
}
