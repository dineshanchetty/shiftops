"use client";

import { useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Target } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Format for legacy: negative in parentheses with red, e.g. "(R1,234.56)" */
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

interface TurnoverRow {
  date: Date;
  dayName: string;
  dateFormatted: string;
  prevYrTO: number;
  budgetNett: number;
  budgetGross: number;
  actualNett: number;
  difference: number;
  rtDifference: number;
  rtPrevYrTO: number;
  rtBudgetNett: number;
  rtActualTO: number;
  growth: number;
  pctGrowth: number;
}

type ColumnKey =
  | "day"
  | "date"
  | "prevYrTO"
  | "budgetNett"
  | "budgetGross"
  | "actualNett"
  | "difference"
  | "rtDifference"
  | "rtPrevYrTO"
  | "rtBudgetNett"
  | "rtActualTO"
  | "growth"
  | "pctGrowth";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "date", label: "Date" },
  { key: "prevYrTO", label: "Prev Yr T/O" },
  { key: "budgetNett", label: "Budget Nett" },
  { key: "budgetGross", label: "Budget Gross" },
  { key: "actualNett", label: "Actual Nett" },
  { key: "difference", label: "Difference" },
  { key: "rtDifference", label: "R/T Difference" },
  { key: "rtPrevYrTO", label: "R/T Prev Yr T/O" },
  { key: "rtBudgetNett", label: "R/T Budget Nett" },
  { key: "rtActualTO", label: "R/T Actual T/O" },
  { key: "growth", label: "Growth" },
  { key: "pctGrowth", label: "% Growth" },
];

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TurnoverBudgetPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<TurnoverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dailyBudget, setDailyBudget] = useState(15000);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(
    () => new Set(ALL_COLUMNS.map((c) => c.key))
  );

  // Summary stats (wages etc) — placeholders from cashup totals
  const [summaryStats, setSummaryStats] = useState({
    actualWageTotal: 0,
    budgetWageTotal: 0,
    prevYearNettTO: 0,
  });

  const toggleCol = useCallback((key: ColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      // Fetch cashups for the period
      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      // Build a map of date -> actual nett turnover
      const actualByDate = new Map<string, number>();
      let totalWages = 0;
      if (cashups) {
        for (const c of cashups as DailyCashup[]) {
          const existing = actualByDate.get(c.date) ?? 0;
          actualByDate.set(c.date, existing + (c.gross_turnover ?? 0));
          totalWages += (c as Record<string, unknown>).total_wages
            ? Number((c as Record<string, unknown>).total_wages)
            : 0;
        }
      }

      // Generate every day of the selected month
      const fromDate = new Date(f.dateFrom + "T00:00:00");
      const toDate = new Date(f.dateTo + "T00:00:00");

      // Determine full month boundaries
      const monthStart = new Date(
        fromDate.getFullYear(),
        fromDate.getMonth(),
        1
      );
      const monthEnd = new Date(
        fromDate.getFullYear(),
        fromDate.getMonth() + 1,
        0
      );
      const startDate =
        monthStart < fromDate ? fromDate : monthStart;
      const endDate = monthEnd > toDate ? toDate : monthEnd;

      const allRows: TurnoverRow[] = [];
      let rtDiff = 0;
      let rtPrevYr = 0;
      let rtBudget = 0;
      let rtActual = 0;

      const current = new Date(startDate);
      while (current <= endDate) {
        const iso = toISODate(current);
        const actualNett = actualByDate.get(iso) ?? 0;
        const budgetNett = dailyBudget;
        const budgetGross = budgetNett * 1.15;
        const prevYr = 0; // placeholder
        const diff = actualNett - budgetNett;

        rtDiff += diff;
        rtPrevYr += prevYr;
        rtBudget += budgetNett;
        rtActual += actualNett;

        const growth = rtActual - rtBudget;
        const pctGrowth =
          rtBudget === 0 ? 0 : (rtActual / rtBudget) * 100 - 100;

        allRows.push({
          date: new Date(current),
          dayName: DAY_NAMES[current.getDay()],
          dateFormatted: fmtDate(current),
          prevYrTO: prevYr,
          budgetNett,
          budgetGross,
          actualNett,
          difference: diff,
          rtDifference: rtDiff,
          rtPrevYrTO: rtPrevYr,
          rtBudgetNett: rtBudget,
          rtActualTO: rtActual,
          growth,
          pctGrowth,
        });

        current.setDate(current.getDate() + 1);
      }

      setRows(allRows);

      // Compute summary stats
      const totalDays = allRows.length;
      const budgetWageTotal = totalDays * dailyBudget * 0.28; // ~28% of budget as wage estimate
      setSummaryStats({
        actualWageTotal: totalWages,
        budgetWageTotal,
        prevYearNettTO: 0,
      });

      setLoading(false);
    },
    [supabase, dailyBudget]
  );

  // Derived totals
  const totals = useMemo(() => {
    const totalActualNett = rows.reduce((s, r) => s + r.actualNett, 0);
    const totalBudgetNett = rows.reduce((s, r) => s + r.budgetNett, 0);
    const totalDifference = totalActualNett - totalBudgetNett;
    const totalBudgetGross = rows.reduce((s, r) => s + r.budgetGross, 0);
    const totalPrevYr = rows.reduce((s, r) => s + r.prevYrTO, 0);
    return {
      totalActualNett,
      totalBudgetNett,
      totalDifference,
      totalBudgetGross,
      totalPrevYr,
    };
  }, [rows]);

  const handleExportCSV = useCallback(() => {
    const headers = ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map(
      (c) => c.label
    );
    const csvRows = rows.map((r) => {
      const vals: (string | number)[] = [];
      if (visibleCols.has("day")) vals.push(r.dayName);
      if (visibleCols.has("date")) vals.push(r.dateFormatted);
      if (visibleCols.has("prevYrTO")) vals.push(r.prevYrTO);
      if (visibleCols.has("budgetNett")) vals.push(r.budgetNett);
      if (visibleCols.has("budgetGross")) vals.push(r.budgetGross);
      if (visibleCols.has("actualNett")) vals.push(r.actualNett);
      if (visibleCols.has("difference")) vals.push(r.difference);
      if (visibleCols.has("rtDifference")) vals.push(r.rtDifference);
      if (visibleCols.has("rtPrevYrTO")) vals.push(r.rtPrevYrTO);
      if (visibleCols.has("rtBudgetNett")) vals.push(r.rtBudgetNett);
      if (visibleCols.has("rtActualTO")) vals.push(r.rtActualTO);
      if (visibleCols.has("growth")) vals.push(r.growth);
      if (visibleCols.has("pctGrowth"))
        vals.push(r.pctGrowth.toFixed(2) + "%");
      return vals;
    });
    triggerDownload(
      generateCSV(headers, csvRows),
      "turnover-actual-vs-budget.csv",
      "text/csv"
    );
  }, [rows, visibleCols]);

  const isCol = (k: ColumnKey) => visibleCols.has(k);

  // Wage % calculations for summary
  const actualWagesPct =
    totals.totalActualNett === 0
      ? 0
      : (summaryStats.actualWageTotal / totals.totalActualNett) * 100;
  const budgetWagesPct =
    totals.totalBudgetNett === 0
      ? 0
      : (summaryStats.budgetWageTotal / totals.totalBudgetNett) * 100;

  return (
    <ReportWrapper
      title="Turnover Report: Actual vs Budget"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Budget input */}
      <div className="flex items-end gap-3 mb-4 print:hidden">
        <div>
          <label className="text-sm font-medium text-base-700 block mb-1.5">
            Daily Budget Nett (R)
          </label>
          <input
            type="number"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value) || 0)}
            className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-40"
          />
        </div>
      </div>

      {/* Show Columns toggles */}
      <div className="mb-4 print:hidden">
        <p className="text-xs font-semibold text-base-500 uppercase tracking-wide mb-2">
          Show Columns
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {ALL_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-1.5 text-sm text-base-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visibleCols.has(col.key)}
                onChange={() => toggleCol(col.key)}
                className="rounded border-base-300"
              />
              {col.label}
            </label>
          ))}
        </div>
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
      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <Target className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-surface-2">
                  {isCol("day") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky top-0 bg-surface-2">
                      Day
                    </th>
                  )}
                  {isCol("date") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky top-0 bg-surface-2">
                      Date
                    </th>
                  )}
                  {isCol("prevYrTO") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Prev Yr T/O
                    </th>
                  )}
                  {isCol("budgetNett") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Budget Nett
                    </th>
                  )}
                  {isCol("budgetGross") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Budget Gross
                    </th>
                  )}
                  {isCol("actualNett") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Actual Nett
                    </th>
                  )}
                  {isCol("difference") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Difference
                    </th>
                  )}
                  {isCol("rtDifference") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      R/T Difference
                    </th>
                  )}
                  {isCol("rtPrevYrTO") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      R/T Prev Yr T/O
                    </th>
                  )}
                  {isCol("rtBudgetNett") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      R/T Budget Nett
                    </th>
                  )}
                  {isCol("rtActualTO") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      R/T Actual T/O
                    </th>
                  )}
                  {isCol("growth") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Growth
                    </th>
                  )}
                  {isCol("pctGrowth") && (
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      % Growth
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                  >
                    {isCol("day") && (
                      <td className="px-3 py-1.5 text-base-900">
                        {r.dayName}
                      </td>
                    )}
                    {isCol("date") && (
                      <td className="px-3 py-1.5 text-base-900">
                        {r.dateFormatted}
                      </td>
                    )}
                    {isCol("prevYrTO") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.prevYrTO)}
                      </td>
                    )}
                    {isCol("budgetNett") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.budgetNett)}
                      </td>
                    )}
                    {isCol("budgetGross") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.budgetGross)}
                      </td>
                    )}
                    {isCol("actualNett") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.actualNett)}
                      </td>
                    )}
                    {isCol("difference") && (
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold",
                          r.difference < 0 ? "text-red-600" : "text-base-900"
                        )}
                      >
                        {fmtNeg(r.difference)}
                      </td>
                    )}
                    {isCol("rtDifference") && (
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold",
                          r.rtDifference < 0 ? "text-red-600" : "text-base-900"
                        )}
                      >
                        {fmtNeg(r.rtDifference)}
                      </td>
                    )}
                    {isCol("rtPrevYrTO") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.rtPrevYrTO)}
                      </td>
                    )}
                    {isCol("rtBudgetNett") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.rtBudgetNett)}
                      </td>
                    )}
                    {isCol("rtActualTO") && (
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {formatCurrency(r.rtActualTO)}
                      </td>
                    )}
                    {isCol("growth") && (
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold",
                          r.growth < 0 ? "text-red-600" : "text-base-900"
                        )}
                      >
                        {fmtNeg(r.growth)}
                      </td>
                    )}
                    {isCol("pctGrowth") && (
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold",
                          r.pctGrowth < 0 ? "text-red-600" : "text-base-900"
                        )}
                      >
                        {r.pctGrowth < 0
                          ? `(${Math.abs(r.pctGrowth).toFixed(2)}%)`
                          : `${r.pctGrowth.toFixed(2)}%`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  {isCol("day") && (
                    <td className="px-3 py-2 text-base-900">Totals</td>
                  )}
                  {isCol("date") && !isCol("day") && (
                    <td className="px-3 py-2 text-base-900">Totals</td>
                  )}
                  {isCol("date") && isCol("day") && (
                    <td className="px-3 py-2 text-base-900" />
                  )}
                  {isCol("prevYrTO") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900">
                      {formatCurrency(totals.totalPrevYr)}
                    </td>
                  )}
                  {isCol("budgetNett") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900">
                      {formatCurrency(totals.totalBudgetNett)}
                    </td>
                  )}
                  {isCol("budgetGross") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900">
                      {formatCurrency(totals.totalBudgetGross)}
                    </td>
                  )}
                  {isCol("actualNett") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900">
                      {formatCurrency(totals.totalActualNett)}
                    </td>
                  )}
                  {isCol("difference") && (
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono font-semibold",
                        totals.totalDifference < 0
                          ? "text-red-600"
                          : "text-base-900"
                      )}
                    >
                      {fmtNeg(totals.totalDifference)}
                    </td>
                  )}
                  {isCol("rtDifference") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900" />
                  )}
                  {isCol("rtPrevYrTO") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900" />
                  )}
                  {isCol("rtBudgetNett") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900" />
                  )}
                  {isCol("rtActualTO") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900" />
                  )}
                  {isCol("growth") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900" />
                  )}
                  {isCol("pctGrowth") && (
                    <td className="px-3 py-2 text-right font-mono text-base-900" />
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary stats block (legacy format) */}
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
                    summaryStats.actualWageTotal - summaryStats.budgetWageTotal <
                      0
                      ? "text-red-600"
                      : "text-base-900"
                  )}
                >
                  {fmtNeg(
                    summaryStats.actualWageTotal - summaryStats.budgetWageTotal
                  )}
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
                  {formatCurrency(totals.totalActualNett)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Budget Nett Turnover</span>
                <span className="font-mono text-base-900">
                  {formatCurrency(totals.totalBudgetNett)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-500">Turnover Difference</span>
                <span
                  className={cn(
                    "font-mono font-semibold",
                    totals.totalDifference < 0
                      ? "text-red-600"
                      : "text-base-900"
                  )}
                >
                  {fmtNeg(totals.totalDifference)}
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
