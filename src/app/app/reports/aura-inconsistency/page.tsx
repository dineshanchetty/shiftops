"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload, calculateVariance } from "@/lib/report-utils";
import { AlertTriangle, CalendarDays, Hash } from "lucide-react";

const COMPARE_FIELDS = [
  { key: "gross_turnover", label: "Gross Turnover" },
  { key: "credit_cards", label: "Credit Cards" },
  { key: "cash_banked", label: "Cash Banked" },
  { key: "discounts", label: "Discounts" },
  { key: "delivery_charges", label: "Delivery Charges" },
  { key: "debtors", label: "Debtors" },
  { key: "stock_take", label: "Stock Take" },
  { key: "tx_count", label: "Transaction Count" },
] as const;

interface InconsistencyRow {
  date: string;
  field: string;
  aura_value: number;
  manual_value: number;
  difference: number;
  pct_diff: number;
}

export default function AuraInconsistencyPage() {
  const supabase = createClient();
  const [data, setData] = useState<InconsistencyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*, aura_imports!daily_cashups_aura_import_id_fkey(raw_data)")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .not("aura_import_id", "is", null)
        .order("date", { ascending: true });

      const rows: InconsistencyRow[] = [];

      if (cashups) {
        for (const c of cashups as (Record<string, unknown> & { date: string; aura_imports: { raw_data: Record<string, unknown> | null } | null })[]) {
          const auraImport = c.aura_imports;
          if (!auraImport?.raw_data) continue;
          const rawData = auraImport.raw_data;

          for (const field of COMPARE_FIELDS) {
            const manualVal = Number(c[field.key]) || 0;
            const auraVal = Number(rawData[field.key]) || 0;

            if (Math.abs(manualVal - auraVal) > 0.01) {
              const { amount, percentage } = calculateVariance(auraVal, manualVal);
              rows.push({ date: c.date, field: field.label, aura_value: auraVal, manual_value: manualVal, difference: amount, pct_diff: percentage });
            }
          }
        }
      }

      setData(rows);
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Field", "Aura Value", "Manual Value", "Difference", "% Diff"];
    const csvRows = data.map((r) => [r.date, r.field, r.aura_value, r.manual_value, r.difference, `${r.pct_diff.toFixed(1)}%`]);
    triggerDownload(generateCSV(headers, csvRows), "aura-inconsistency.csv", "text/csv");
  }, [data]);

  const totalInconsistencies = data.length;
  const largestVariance = data.length > 0 ? data.reduce((a, b) => (Math.abs(a.difference) > Math.abs(b.difference) ? a : b)) : null;
  const daysWithIssues = new Set(data.map((r) => r.date)).size;

  return (
    <ReportWrapper title="Aura Inconsistency Report" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Inconsistencies" value={totalInconsistencies} icon={<Hash className="h-5 w-5" />} />
        <StatCard label="Largest Variance" value={largestVariance ? formatCurrency(Math.abs(largestVariance.difference)) : "-"} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Days with Issues" value={daysWithIssues} icon={<CalendarDays className="h-5 w-5" />} />
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <CalendarDays className="h-12 w-12 mb-3" />
          <p className="text-sm">No inconsistencies found for selected period</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Date", "Field", "Aura Value", "Manual Value", "Difference", "% Diff"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Date" || h === "Field" ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => {
                const isLargeVariance = Math.abs(row.pct_diff) > 5;
                return (
                  <tr key={`${row.date}-${row.field}-${idx}`} className={cn("border-b border-base-200 hover:bg-surface-2 transition-colors", isLargeVariance && "bg-red-50")}>
                    <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                    <td className="px-4 py-2 text-base-900 font-medium">{row.field}</td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.aura_value)}</td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.manual_value)}</td>
                    <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.difference !== 0 ? "text-red-600" : "text-green-600")}>{formatCurrency(row.difference)}</td>
                    <td className={cn("px-4 py-2 text-right font-mono font-semibold", isLargeVariance ? "text-red-600" : "text-base-900")}>{row.pct_diff.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
