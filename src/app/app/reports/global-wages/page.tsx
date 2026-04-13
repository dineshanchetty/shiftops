"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Scale, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";

interface GlobalWagesRow {
  branchId: string;
  branchName: string;
  totalTurnover: number;
  totalWages: number;
  wagesPct: number;
  targetPct: number;
  overUnder: number;
}

export default function GlobalWagesPage() {
  const supabase = createClient();
  const [data, setData] = useState<GlobalWagesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetPct, setTargetPct] = useState(25);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const [{ data: cashups }, { data: branches }] = await Promise.all([
        supabase
          .from("daily_cashups")
          .select("*")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo),
        supabase.from("branches").select("id, name"),
      ]);

      if (!cashups || cashups.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const branchMap = new Map((branches ?? []).map((b) => [b.id, b.name]));

      // Get cashup IDs for driver entries
      const cashupIds = (cashups as DailyCashup[]).map((c) => c.id);
      const { data: driverEntries } = await supabase
        .from("cashup_driver_entries")
        .select("cashup_id, wages")
        .in("cashup_id", cashupIds);

      // Map cashup_id -> branch_id for driver entries
      const cashupBranchMap = new Map((cashups as DailyCashup[]).map((c) => [c.id, c.branch_id]));

      // Aggregate turnover per branch
      const branchTurnover = new Map<string, number>();
      for (const c of cashups as DailyCashup[]) {
        branchTurnover.set(c.branch_id, (branchTurnover.get(c.branch_id) ?? 0) + (c.gross_turnover ?? 0));
      }

      // Aggregate wages per branch from driver entries
      const branchWages = new Map<string, number>();
      if (driverEntries) {
        for (const d of driverEntries) {
          const branchId = cashupBranchMap.get(d.cashup_id);
          if (branchId) {
            branchWages.set(branchId, (branchWages.get(branchId) ?? 0) + (d.wages ?? 0));
          }
        }
      }

      const allBranchIds = new Set([...Array.from(branchTurnover.keys()), ...Array.from(branchWages.keys())]);
      const rows: GlobalWagesRow[] = Array.from(allBranchIds).map((branchId) => {
        const turnover = branchTurnover.get(branchId) ?? 0;
        const wages = branchWages.get(branchId) ?? 0;
        const pct = turnover > 0 ? (wages / turnover) * 100 : 0;
        return {
          branchId,
          branchName: branchMap.get(branchId) ?? "Unknown",
          totalTurnover: turnover,
          totalWages: wages,
          wagesPct: pct,
          targetPct,
          overUnder: pct - targetPct,
        };
      });

      rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
      setData(rows);
      setLoading(false);
    },
    [supabase, targetPct]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Branch", "Total Turnover", "Total Wages", "Wages %", "Target %", "Over/Under"];
    const rows = data.map((r) => [r.branchName, r.totalTurnover, r.totalWages, r.wagesPct.toFixed(1), r.targetPct, r.overUnder.toFixed(1)]);
    triggerDownload(generateCSV(headers, rows), "global-wages-comparison.csv", "text/csv");
  }, [data]);

  const totalWagesAll = data.reduce((s, r) => s + r.totalWages, 0);
  const totalTurnoverAll = data.reduce((s, r) => s + r.totalTurnover, 0);
  const avgWagesPct = totalTurnoverAll > 0 ? (totalWagesAll / totalTurnoverAll) * 100 : 0;
  const highestCost = data.length > 0 ? data.reduce((max, r) => r.wagesPct > max.wagesPct ? r : max, data[0]) : null;

  return (
    <ReportWrapper title="Global Wages Comparison" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Target input */}
      <div className="flex items-end gap-3 mb-6 print:hidden">
        <div>
          <label className="text-sm font-medium text-base-700 block mb-1.5">Target Wages % of Turnover</label>
          <input
            type="number"
            value={targetPct}
            onChange={(e) => setTargetPct(Number(e.target.value) || 0)}
            className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-32"
            step={0.5}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Wages (All)" value={formatCurrency(totalWagesAll)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Average Wages %" value={`${avgWagesPct.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Highest Cost Branch" value={highestCost?.branchName ?? "-"} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Branches" value={data.length} icon={<Scale className="h-5 w-5" />} />
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
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Branch", "Total Turnover", "Total Wages", "Wages %", "Target %", "Over/Under"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Branch" ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.branchId} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900 font-medium">{row.branchName}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.totalTurnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.totalWages)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.wagesPct > targetPct ? "text-red-600" : "text-green-600")}>
                    {row.wagesPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.targetPct}%</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.overUnder > 0 ? "text-red-600" : "text-green-600")}>
                    {row.overUnder > 0 ? "+" : ""}{row.overUnder.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">All Branches</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalTurnoverAll)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalWagesAll)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", avgWagesPct > targetPct ? "text-red-600" : "text-green-600")}>
                  {avgWagesPct.toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{targetPct}%</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", avgWagesPct - targetPct > 0 ? "text-red-600" : "text-green-600")}>
                  {avgWagesPct - targetPct > 0 ? "+" : ""}{(avgWagesPct - targetPct).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
