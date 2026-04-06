"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Receipt, Banknote, AlertTriangle, CalendarDays } from "lucide-react";

interface BankingRow {
  date: string;
  gross_turnover: number;
  discounts: number;
  credit_cards: number;
  cash_banked: number;
  cc_batch_total: number;
  variance: number;
}

export default function DailyBankingPage() {
  const supabase = createClient();
  const [data, setData] = useState<BankingRow[]>([]);
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
        const byDate = new Map<string, BankingRow>();
        for (const c of cashups as DailyCashup[]) {
          const gross = c.gross_turnover ?? 0;
          const disc = c.discounts ?? 0;
          const cc = c.credit_cards ?? 0;
          const banked = c.cash_banked ?? 0;
          const batch = c.cc_batch_total ?? 0;
          const variance = banked + batch - (gross - disc);

          const existing = byDate.get(c.date);
          if (existing) {
            existing.gross_turnover += gross;
            existing.discounts += disc;
            existing.credit_cards += cc;
            existing.cash_banked += banked;
            existing.cc_batch_total += batch;
            existing.variance += variance;
          } else {
            byDate.set(c.date, { date: c.date, gross_turnover: gross, discounts: disc, credit_cards: cc, cash_banked: banked, cc_batch_total: batch, variance });
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
    const headers = ["Date", "Gross Turnover", "Discounts", "Credit Cards", "Cash Banked", "CC Batch", "Variance"];
    const rows = data.map((r) => [r.date, r.gross_turnover, r.discounts, r.credit_cards, r.cash_banked, r.cc_batch_total, r.variance]);
    triggerDownload(generateCSV(headers, rows), "daily-banking-summary.csv", "text/csv");
  }, [data]);

  const totals = data.reduce(
    (acc, r) => ({
      gross_turnover: acc.gross_turnover + r.gross_turnover,
      discounts: acc.discounts + r.discounts,
      credit_cards: acc.credit_cards + r.credit_cards,
      cash_banked: acc.cash_banked + r.cash_banked,
      cc_batch_total: acc.cc_batch_total + r.cc_batch_total,
      variance: acc.variance + r.variance,
    }),
    { gross_turnover: 0, discounts: 0, credit_cards: 0, cash_banked: 0, cc_batch_total: 0, variance: 0 }
  );

  return (
    <ReportWrapper title="Daily Banking Summary" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Turnover" value={formatCurrency(totals.gross_turnover)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Total Banking" value={formatCurrency(totals.cash_banked + totals.cc_batch_total)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Total Variance" value={formatCurrency(totals.variance)} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Days Reported" value={data.length} icon={<CalendarDays className="h-5 w-5" />} />
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
          <CalendarDays className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Date", "Gross Turnover", "Discounts", "Credit Cards", "Cash Banked", "CC Batch", "Variance"].map((h) => (
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
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.gross_turnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.discounts)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.credit_cards)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.cash_banked)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.cc_batch_total)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.variance < 0 ? "text-red-600" : row.variance === 0 ? "text-green-600" : "text-base-900")}>
                    {formatCurrency(row.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.gross_turnover)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.discounts)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.credit_cards)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.cash_banked)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.cc_batch_total)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", totals.variance < 0 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(totals.variance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
