"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";

import { Scale } from "lucide-react";

interface WageBreakdown {
  normal: number;
  sunday: number;
  ph: number;
  leave: number;
  sick: number;
  total: number;
}

interface GlobalWagesRow {
  branchId: string;
  branchName: string;
  left: WageBreakdown;
  right: WageBreakdown;
  difference: number;
}

function emptyBreakdown(): WageBreakdown {
  return { normal: 0, sunday: 0, ph: 0, leave: 0, sick: 0, total: 0 };
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDefaultPeriods() {
  const now = new Date();
  // Left period = last month
  const leftFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const leftTo = new Date(now.getFullYear(), now.getMonth(), 0);
  // Right period = this month
  const rightFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const rightTo = now;
  return {
    leftFrom: toISODate(leftFrom),
    leftTo: toISODate(leftTo),
    rightFrom: toISODate(rightFrom),
    rightTo: toISODate(rightTo),
  };
}

export default function GlobalWagesPage() {
  const supabase = createClient();
  const [data, setData] = useState<GlobalWagesRow[]>([]);
  const [loading, setLoading] = useState(false);

  const defaults = getDefaultPeriods();
  const [leftFrom, setLeftFrom] = useState(defaults.leftFrom);
  const [leftTo, setLeftTo] = useState(defaults.leftTo);
  const [rightFrom, setRightFrom] = useState(defaults.rightFrom);
  const [rightTo, setRightTo] = useState(defaults.rightTo);

  const fetchWagesForPeriod = useCallback(
    async (
      branchIds: string[],
      dateFrom: string,
      dateTo: string
    ): Promise<Map<string, WageBreakdown>> => {
      // Get cashups in range
      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id, branch_id, date")
        .in("branch_id", branchIds)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      if (!cashups || cashups.length === 0) return new Map();

      const cashupIds = cashups.map((c) => c.id);
      const cashupMeta = new Map(
        cashups.map((c) => [c.id, { branchId: c.branch_id, date: c.date }])
      );

      // Get driver entries for wages
      const { data: driverEntries } = await supabase
        .from("cashup_driver_entries")
        .select("cashup_id, wages")
        .in("cashup_id", cashupIds);

      const branchBreakdowns = new Map<string, WageBreakdown>();

      if (driverEntries) {
        for (const d of driverEntries) {
          const meta = cashupMeta.get(d.cashup_id);
          if (!meta) continue;

          const wages = d.wages ?? 0;
          const dayOfWeek = new Date(meta.date).getDay(); // 0=Sun, 6=Sat

          if (!branchBreakdowns.has(meta.branchId)) {
            branchBreakdowns.set(meta.branchId, emptyBreakdown());
          }
          const bd = branchBreakdowns.get(meta.branchId)!;

          if (dayOfWeek === 0) {
            // Sunday
            bd.sunday += wages;
          } else {
            // Mon-Sat = Normal
            bd.normal += wages;
          }
          bd.total += wages;
          // PH, Leave, Sick = R0.00 for now
        }
      }

      return branchBreakdowns;
    },
    [supabase]
  );

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const [leftData, rightData, { data: branches }] = await Promise.all([
        fetchWagesForPeriod(f.branchIds, leftFrom, leftTo),
        fetchWagesForPeriod(f.branchIds, rightFrom, rightTo),
        supabase.from("branches").select("id, name"),
      ]);

      const branchMap = new Map(
        (branches ?? []).map((b) => [b.id, b.name as string])
      );

      // Build rows for all branches that have data in either period
      const allBranchIds = new Set([
        ...f.branchIds,
        ...Array.from(leftData.keys()),
        ...Array.from(rightData.keys()),
      ]);

      const rows: GlobalWagesRow[] = Array.from(allBranchIds)
        .filter((id) => f.branchIds.includes(id))
        .map((branchId) => {
          const left = leftData.get(branchId) ?? emptyBreakdown();
          const right = rightData.get(branchId) ?? emptyBreakdown();
          return {
            branchId,
            branchName: branchMap.get(branchId) ?? "Unknown",
            left,
            right,
            difference: left.total - right.total,
          };
        });

      rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
      setData(rows);
      setLoading(false);
    },
    [supabase, fetchWagesForPeriod, leftFrom, leftTo, rightFrom, rightTo]
  );

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Branch",
      "L-Normal",
      "L-Sunday",
      "L-PH",
      "L-Leave",
      "L-Sick",
      "L-Total",
      "R-Normal",
      "R-Sunday",
      "R-PH",
      "R-Leave",
      "R-Sick",
      "R-Total",
      "Difference",
    ];
    const csvRows = data.map((r) => [
      r.branchName,
      r.left.normal,
      r.left.sunday,
      r.left.ph,
      r.left.leave,
      r.left.sick,
      r.left.total,
      r.right.normal,
      r.right.sunday,
      r.right.ph,
      r.right.leave,
      r.right.sick,
      r.right.total,
      r.difference,
    ]);

    // Total row
    const totLeft = data.reduce(
      (acc, r) => ({
        normal: acc.normal + r.left.normal,
        sunday: acc.sunday + r.left.sunday,
        ph: acc.ph + r.left.ph,
        leave: acc.leave + r.left.leave,
        sick: acc.sick + r.left.sick,
        total: acc.total + r.left.total,
      }),
      emptyBreakdown()
    );
    const totRight = data.reduce(
      (acc, r) => ({
        normal: acc.normal + r.right.normal,
        sunday: acc.sunday + r.right.sunday,
        ph: acc.ph + r.right.ph,
        leave: acc.leave + r.right.leave,
        sick: acc.sick + r.right.sick,
        total: acc.total + r.right.total,
      }),
      emptyBreakdown()
    );
    csvRows.push([
      "Total",
      totLeft.normal,
      totLeft.sunday,
      totLeft.ph,
      totLeft.leave,
      totLeft.sick,
      totLeft.total,
      totRight.normal,
      totRight.sunday,
      totRight.ph,
      totRight.leave,
      totRight.sick,
      totRight.total,
      totLeft.total - totRight.total,
    ]);

    triggerDownload(
      generateCSV(headers, csvRows),
      "global-wages-comparison.csv",
      "text/csv"
    );
  }, [data]);

  // Totals
  const totLeft = data.reduce(
    (acc, r) => ({
      normal: acc.normal + r.left.normal,
      sunday: acc.sunday + r.left.sunday,
      ph: acc.ph + r.left.ph,
      leave: acc.leave + r.left.leave,
      sick: acc.sick + r.left.sick,
      total: acc.total + r.left.total,
    }),
    emptyBreakdown()
  );
  const totRight = data.reduce(
    (acc, r) => ({
      normal: acc.normal + r.right.normal,
      sunday: acc.sunday + r.right.sunday,
      ph: acc.ph + r.right.ph,
      leave: acc.leave + r.right.leave,
      sick: acc.sick + r.right.sick,
      total: acc.total + r.right.total,
    }),
    emptyBreakdown()
  );
  const totalDifference = totLeft.total - totRight.total;

  const wageHeaders = ["Normal", "Sunday", "PH", "Leave", "Sick", "Total"];

  function renderBreakdownCells(bd: WageBreakdown, borderLeft = false) {
    const base = "px-3 py-2 text-right font-mono text-base-900";
    return (
      <>
        <td className={cn(base, borderLeft && "border-l border-base-200")}>
          {formatCurrency(bd.normal)}
        </td>
        <td className={base}>{formatCurrency(bd.sunday)}</td>
        <td className={base}>{formatCurrency(bd.ph)}</td>
        <td className={base}>{formatCurrency(bd.leave)}</td>
        <td className={base}>{formatCurrency(bd.sick)}</td>
        <td className={cn(base, "font-semibold")}>
          {formatCurrency(bd.total)}
        </td>
      </>
    );
  }

  return (
    <ReportWrapper
      title="Global Wages Comparison Report"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Dual-period controls */}
      <div className="flex flex-wrap items-end gap-4 mb-6 print:hidden">
        <div className="flex items-end gap-2 p-3 border border-base-200 rounded-lg bg-surface">
          <div>
            <label className="text-xs font-medium text-base-500 block mb-1">
              Left Period From
            </label>
            <input
              type="date"
              value={leftFrom}
              onChange={(e) => setLeftFrom(e.target.value)}
              className="h-9 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-base-500 block mb-1">
              To
            </label>
            <input
              type="date"
              value={leftTo}
              onChange={(e) => setLeftTo(e.target.value)}
              className="h-9 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
            />
          </div>
        </div>

        <div className="flex items-end gap-2 p-3 border border-base-200 rounded-lg bg-surface">
          <div>
            <label className="text-xs font-medium text-base-500 block mb-1">
              Right Period From
            </label>
            <input
              type="date"
              value={rightFrom}
              onChange={(e) => setRightFrom(e.target.value)}
              className="h-9 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-base-500 block mb-1">
              To
            </label>
            <input
              type="date"
              value={rightTo}
              onChange={(e) => setRightTo(e.target.value)}
              className="h-9 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-base-500 block mb-1">
            Columns
          </label>
          <select
            className="h-9 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
            defaultValue="actual"
          >
            <option value="actual">Actual</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-base-500 block mb-1">
            Values
          </label>
          <select
            className="h-9 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
            defaultValue="amounts"
          >
            <option value="amounts">Amounts</option>
          </select>
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
      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <Scale className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected periods</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              {/* Group header row */}
              <tr className="bg-surface-2">
                <th
                  rowSpan={2}
                  className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left border-r border-base-200 sticky top-0 bg-surface-2"
                >
                  Branch
                </th>
                <th
                  colSpan={6}
                  className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-center border-r border-base-200 bg-surface-2"
                >
                  Actual Amounts From {leftFrom} to {leftTo}
                </th>
                <th
                  colSpan={6}
                  className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-center border-r border-base-200 bg-surface-2"
                >
                  Actual Amounts From {rightFrom} to {rightTo}
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2"
                >
                  Difference
                </th>
              </tr>
              {/* Sub-header row */}
              <tr className="bg-surface-2 border-t border-base-200">
                {wageHeaders.map((h) => (
                  <th
                    key={`l-${h}`}
                    className="px-3 py-1 text-xs uppercase tracking-wide font-semibold text-base-400 text-right bg-surface-2"
                  >
                    {h}
                  </th>
                ))}
                {wageHeaders.map((h) => (
                  <th
                    key={`r-${h}`}
                    className="px-3 py-1 text-xs uppercase tracking-wide font-semibold text-base-400 text-right bg-surface-2 border-l border-base-200"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.branchId}
                  className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-2 text-base-900 font-medium border-r border-base-200">
                    {row.branchName}
                  </td>
                  {renderBreakdownCells(row.left)}
                  {renderBreakdownCells(row.right, true)}
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono font-semibold border-l border-base-200",
                      row.difference < 0 ? "text-red-600" : "text-base-900"
                    )}
                  >
                    {formatCurrency(row.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900 border-r border-base-200">
                  Total
                </td>
                {renderBreakdownCells(totLeft)}
                {renderBreakdownCells(totRight, true)}
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono font-semibold border-l border-base-200",
                    totalDifference < 0 ? "text-red-600" : "text-base-900"
                  )}
                >
                  {formatCurrency(totalDifference)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
