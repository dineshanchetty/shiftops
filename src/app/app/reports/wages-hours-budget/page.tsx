"use client";

import React, { useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Clock } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtNeg(amount: number): string {
  if (amount < 0) {
    return `(R ${Math.abs(amount).toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`;
  }
  return formatCurrency(amount);
}

function fmtHoursNeg(hours: number): string {
  if (hours < 0) return `(${Math.abs(hours).toFixed(1)})`;
  return hours.toFixed(1);
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface WagesRow {
  staffId: string;
  name: string;
  group: string; // MANAGEMENT, FRONT OF HOUSE, BACK OF HOUSE, DRIVERS
  budgetHours: number;
  budgetAmount: number;
  actualHours: number;
  actualAmount: number;
  diffHours: number;
  diffAmount: number;
}

// Position category grouping order
const GROUP_ORDER = [
  "MANAGEMENT",
  "FRONT OF HOUSE",
  "BACK OF HOUSE",
  "DRIVERS",
];

function inferGroup(positionName: string): string {
  const lower = (positionName ?? "").toLowerCase();
  if (lower.includes("manager") || lower.includes("management"))
    return "MANAGEMENT";
  if (
    lower.includes("driver") ||
    lower.includes("delivery")
  )
    return "DRIVERS";
  if (
    lower.includes("kitchen") ||
    lower.includes("chef") ||
    lower.includes("cook") ||
    lower.includes("boh") ||
    lower.includes("back of house") ||
    lower.includes("prep")
  )
    return "BACK OF HOUSE";
  return "FRONT OF HOUSE";
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function WagesHoursBudgetPage() {
  const supabase = createClient();
  const [data, setData] = useState<WagesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [defaultHourlyRate] = useState(45); // Default rate
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
        { data: attendanceRecords },
        { data: staffList },
        { data: positions },
        { data: cashups },
      ] = await Promise.all([
        supabase
          .from("roster_entries")
          .select("*")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo)
          .eq("is_off", false),
        supabase.from("attendance").select("roster_entry_id, actual_hours"),
        supabase
          .from("staff")
          .select("id, first_name, last_name, position_id"),
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
      const staffMap = new Map(
        (staffList ?? []).map((s) => [
          s.id,
          {
            name: `${s.first_name} ${s.last_name}`,
            positionId: s.position_id as string,
            hourlyRate: defaultHourlyRate,
          },
        ])
      );
      const attendanceMap = new Map(
        (attendanceRecords ?? []).map((a) => [
          a.roster_entry_id,
          a.actual_hours ?? 0,
        ])
      );

      // Calculate budget hours per staff from the date range
      const from = new Date(f.dateFrom);
      const to = new Date(f.dateTo);
      const days = Math.max(
        1,
        (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24) + 1
      );
      const weeks = Math.max(1, days / 7);

      // Aggregate per staff
      const staffAgg = new Map<
        string,
        { scheduled: number; actual: number }
      >();

      if (entries) {
        for (const e of entries) {
          const existing = staffAgg.get(e.staff_id) ?? {
            scheduled: 0,
            actual: 0,
          };
          const scheduledHrs = e.shift_hours ?? 0;
          const actualHrs = attendanceMap.get(e.id) ?? scheduledHrs;
          existing.scheduled += scheduledHrs;
          existing.actual += actualHrs;
          staffAgg.set(e.staff_id, existing);
        }
      }

      const rows: WagesRow[] = Array.from(staffAgg.entries()).map(
        ([staffId, agg]) => {
          const info = staffMap.get(staffId);
          const pos = posMap.get(info?.positionId ?? "");
          const posName = pos?.name ?? "";
          const rate = info?.hourlyRate ?? defaultHourlyRate;
          const budgetHours = 40 * weeks; // 40h/week default budget
          const budgetAmount = budgetHours * rate;
          const actualAmount = agg.actual * rate;
          return {
            staffId,
            name: info?.name ?? "Unknown",
            group: inferGroup(posName),
            budgetHours,
            budgetAmount,
            actualHours: agg.actual,
            actualAmount,
            diffHours: budgetHours - agg.actual,
            diffAmount: budgetAmount - actualAmount,
          };
        }
      );

      // Sort by group order, then name
      rows.sort((a, b) => {
        const aIdx = GROUP_ORDER.indexOf(a.group);
        const bIdx = GROUP_ORDER.indexOf(b.group);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.name.localeCompare(b.name);
      });

      setData(rows);

      // Summary
      const actualTO = (cashups ?? []).reduce(
        (s, c) => s + (c.gross_turnover ?? 0),
        0
      );
      const totalDays = days;
      const budgetTO = totalDays * 15000;
      const totalActualWages = rows.reduce((s, r) => s + r.actualAmount, 0);
      const totalBudgetWages = rows.reduce((s, r) => s + r.budgetAmount, 0);

      setSummaryStats({
        actualWageTotal: totalActualWages,
        budgetWageTotal: totalBudgetWages,
        prevYearNettTO: 0,
        actualNettTO: actualTO,
        budgetNettTO: budgetTO,
      });

      setLoading(false);
    },
    [supabase, defaultHourlyRate]
  );

  // Group the data for rendering
  const grouped = useMemo(() => {
    const groups: { label: string; rows: WagesRow[] }[] = [];
    let currentGroup = "";
    let currentRows: WagesRow[] = [];

    for (const row of data) {
      if (row.group !== currentGroup) {
        if (currentRows.length > 0) {
          groups.push({ label: currentGroup, rows: currentRows });
        }
        currentGroup = row.group;
        currentRows = [row];
      } else {
        currentRows.push(row);
      }
    }
    if (currentRows.length > 0) {
      groups.push({ label: currentGroup, rows: currentRows });
    }
    return groups;
  }, [data]);

  // Grand totals
  const grandTotals = useMemo(
    () => ({
      budgetHours: data.reduce((s, r) => s + r.budgetHours, 0),
      budgetAmount: data.reduce((s, r) => s + r.budgetAmount, 0),
      actualHours: data.reduce((s, r) => s + r.actualHours, 0),
      actualAmount: data.reduce((s, r) => s + r.actualAmount, 0),
      diffHours: data.reduce((s, r) => s + r.diffHours, 0),
      diffAmount: data.reduce((s, r) => s + r.diffAmount, 0),
    }),
    [data]
  );

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Employee Name",
      "Group",
      "Budget Hours",
      "Budget Amount",
      "Actual Hours",
      "Actual Amount",
      "Difference Hours",
      "Difference Amount",
    ];
    const csvRows = data.map((r) => [
      r.name,
      r.group,
      r.budgetHours.toFixed(1),
      r.budgetAmount.toFixed(2),
      r.actualHours.toFixed(1),
      r.actualAmount.toFixed(2),
      r.diffHours.toFixed(1),
      r.diffAmount.toFixed(2),
    ]);
    triggerDownload(
      generateCSV(headers, csvRows),
      "wages-hours-budget.csv",
      "text/csv"
    );
  }, [data]);

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

  const HEADERS = [
    { label: "Employee Name", align: "left" as const },
    { label: "Budget Hours", align: "right" as const },
    { label: "Budget Amount", align: "right" as const },
    { label: "Actual Hours", align: "right" as const },
    { label: "Actual Amount", align: "right" as const },
    { label: "Difference Hours", align: "right" as const },
    { label: "Difference Amount", align: "right" as const },
  ];

  return (
    <ReportWrapper
      title="Wages Hours Report: Actual vs Budget"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <Clock className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-surface-2">
                  {HEADERS.map((h) => (
                    <th
                      key={h.label}
                      className={cn(
                        "px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2",
                        h.align === "left" ? "text-left" : "text-right"
                      )}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => {
                  const subBudgetH = group.rows.reduce(
                    (s, r) => s + r.budgetHours,
                    0
                  );
                  const subBudgetA = group.rows.reduce(
                    (s, r) => s + r.budgetAmount,
                    0
                  );
                  const subActualH = group.rows.reduce(
                    (s, r) => s + r.actualHours,
                    0
                  );
                  const subActualA = group.rows.reduce(
                    (s, r) => s + r.actualAmount,
                    0
                  );
                  const subDiffH = group.rows.reduce(
                    (s, r) => s + r.diffHours,
                    0
                  );
                  const subDiffA = group.rows.reduce(
                    (s, r) => s + r.diffAmount,
                    0
                  );

                  return (
                    <React.Fragment key={group.label}>
                      {/* Group header */}
                      <tr className="bg-base-100">
                        <td
                          colSpan={7}
                          className="px-3 py-2 text-xs uppercase tracking-wide font-bold text-base-600"
                        >
                          {group.label}
                        </td>
                      </tr>

                      {/* Staff rows */}
                      {group.rows.map((r) => (
                        <tr
                          key={r.staffId}
                          className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                        >
                          <td className="px-3 py-1.5 text-base-900 font-medium pl-6">
                            {r.name}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {r.budgetHours.toFixed(1)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.budgetAmount)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {r.actualHours.toFixed(1)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.actualAmount)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right font-mono font-semibold",
                              r.diffHours < 0
                                ? "text-red-600"
                                : "text-base-900"
                            )}
                          >
                            {fmtHoursNeg(r.diffHours)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right font-mono font-semibold",
                              r.diffAmount < 0
                                ? "text-red-600"
                                : "text-base-900"
                            )}
                          >
                            {fmtNeg(r.diffAmount)}
                          </td>
                        </tr>
                      ))}

                      {/* Sub Total */}
                      <tr className="bg-surface-2 border-b border-base-300">
                        <td className="px-3 py-1.5 text-base-700 font-semibold text-sm">
                          Sub Total
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-base-900">
                          {subBudgetH.toFixed(1)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-base-900">
                          {formatCurrency(subBudgetA)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-base-900">
                          {subActualH.toFixed(1)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-base-900">
                          {formatCurrency(subActualA)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right font-mono font-semibold",
                            subDiffH < 0 ? "text-red-600" : "text-base-900"
                          )}
                        >
                          {fmtHoursNeg(subDiffH)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right font-mono font-semibold",
                            subDiffA < 0 ? "text-red-600" : "text-base-900"
                          )}
                        >
                          {fmtNeg(subDiffA)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-bold">
                  <td className="px-3 py-2 text-base-900">Grand Total</td>
                  <td className="px-3 py-2 text-right font-mono text-base-900">
                    {grandTotals.budgetHours.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-base-900">
                    {formatCurrency(grandTotals.budgetAmount)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-base-900">
                    {grandTotals.actualHours.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-base-900">
                    {formatCurrency(grandTotals.actualAmount)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono font-bold",
                      grandTotals.diffHours < 0
                        ? "text-red-600"
                        : "text-base-900"
                    )}
                  >
                    {fmtHoursNeg(grandTotals.diffHours)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono font-bold",
                      grandTotals.diffAmount < 0
                        ? "text-red-600"
                        : "text-base-900"
                    )}
                  >
                    {fmtNeg(grandTotals.diffAmount)}
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

