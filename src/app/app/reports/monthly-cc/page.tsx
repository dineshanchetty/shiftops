"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Wallet, CreditCard, AlertTriangle, CalendarDays } from "lucide-react";

interface CCRow {
  date: string;
  creditCardTotal: number;
  ccBatchTotal: number;
  variance: number;
}

export default function MonthlyCCPage() {
  const supabase = createClient();
  const [data, setData] = useState<CCRow[]>([]);
  const [loading, setLoading] = useState(false);

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
        const byDate = new Map<string, CCRow>();
        for (const c of cashups as DailyCashup[]) {
          const cc = c.credit_cards ?? 0;
          const batch = c.cc_batch_total ?? 0;
          const variance = cc - batch;

          const existing = byDate.get(c.date);
          if (existing) {
            existing.creditCardTotal += cc;
            existing.ccBatchTotal += batch;
            existing.variance += variance;
          } else {
            byDate.set(c.date, { date: c.date, creditCardTotal: cc, ccBatchTotal: batch, variance });
          }
        }
        setData(Array.from(byDate.values()));
      } else {
        setData([]);
      }
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Credit Card Total", "CC Batch Total", "Variance"];
    const rows = data.map((r) => [r.date, r.creditCardTotal, r.ccBatchTotal, r.variance]);
    triggerDownload(generateCSV(headers, rows), "monthly-cc-summary.csv", "text/csv");
  }, [data]);

  const totalCC = data.reduce((s, r) => s + r.creditCardTotal, 0);
  const totalBatch = data.reduce((s, r) => s + r.ccBatchTotal, 0);
  const netVariance = totalCC - totalBatch;
  const mismatchDays = data.filter((r) => Math.abs(r.variance) > 0.01).length;

  return (
    <ReportWrapper title="Monthly Credit Card Summary" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total CC Sales" value={formatCurrency(totalCC)} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Total CC Batched" value={formatCurrency(totalBatch)} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Net Variance" value={formatCurrency(netVariance)} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Mismatch Days" value={mismatchDays} icon={<CalendarDays className="h-5 w-5" />} />
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
          <Wallet className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Date", "Credit Card Total", "CC Batch Total", "Variance"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Date" ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className={cn("border-b border-base-200 hover:bg-surface-2 transition-colors", Math.abs(row.variance) > 0.01 && "bg-red-50")}>
                  <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.creditCardTotal)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.ccBatchTotal)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", Math.abs(row.variance) > 0.01 ? "text-red-600" : "text-green-600")}>
                    {formatCurrency(row.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalCC)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalBatch)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", Math.abs(netVariance) > 0.01 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(netVariance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
