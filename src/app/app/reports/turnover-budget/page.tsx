"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Target, TrendingUp, TrendingDown, CalendarDays } from "lucide-react";

interface BudgetRow {
  date: string;
  actual: number;
  budget: number;
  variance: number;
  variancePct: number;
}

export default function TurnoverBudgetPage() {
  const supabase = createClient();
  const [data, setData] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dailyBudget, setDailyBudget] = useState(40000);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      if (cashups) {
        const byDate = new Map<string, number>();
        for (const c of cashups as DailyCashup[]) {
          const existing = byDate.get(c.date) ?? 0;
          byDate.set(c.date, existing + (c.gross_turnover ?? 0));
        }

        const rows: BudgetRow[] = Array.from(byDate.entries()).map(([date, actual]) => {
          const variance = actual - dailyBudget;
          const variancePct = dailyBudget === 0 ? 0 : (variance / dailyBudget) * 100;
          return { date, actual, budget: dailyBudget, variance, variancePct };
        });

        setData(rows);
      } else {
        setData([]);
      }
      setLoading(false);
    },
    [supabase, dailyBudget]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Actual Turnover", "Budget", "Variance", "Variance %"];
    const rows = data.map((r) => [r.date, r.actual, r.budget, r.variance, r.variancePct.toFixed(1)]);
    triggerDownload(generateCSV(headers, rows), "turnover-vs-budget.csv", "text/csv");
  }, [data]);

  const totalActual = data.reduce((s, r) => s + r.actual, 0);
  const totalBudget = data.reduce((s, r) => s + r.budget, 0);
  const overallVariance = totalActual - totalBudget;
  const overallVariancePct = totalBudget === 0 ? 0 : (overallVariance / totalBudget) * 100;

  return (
    <ReportWrapper title="Turnover Actual vs Budget" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Budget input */}
      <div className="flex items-end gap-3 mb-6 print:hidden">
        <div>
          <label className="text-sm font-medium text-base-700 block mb-1.5">Daily Budget Target (R)</label>
          <input
            type="number"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value) || 0)}
            className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-40"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Actual" value={formatCurrency(totalActual)} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total Budget" value={formatCurrency(totalBudget)} icon={<Target className="h-5 w-5" />} />
        <StatCard label="Overall Variance" value={formatCurrency(overallVariance)} icon={overallVariance >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />} />
        <StatCard label="Variance %" value={`${overallVariancePct.toFixed(1)}%`} icon={<CalendarDays className="h-5 w-5" />} />
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
          <Target className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Date", "Actual Turnover", "Budget", "Variance", "Variance %"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Date" ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.actual)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.budget)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.variance < 0 ? "text-red-600" : "text-green-600")}>
                    {formatCurrency(row.variance)}
                  </td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.variancePct < 0 ? "text-red-600" : "text-green-600")}>
                    {row.variancePct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalActual)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalBudget)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", overallVariance < 0 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(overallVariance)}
                </td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", overallVariancePct < 0 ? "text-red-600" : "text-green-600")}>
                  {overallVariancePct.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
