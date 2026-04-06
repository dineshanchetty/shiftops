"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { CalendarDays, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";

interface SummaryRow {
  date: string;
  turnover: number;
  discounts: number;
  delivery_charges: number;
  credit_cards: number;
  debtors: number;
  online_payments: number;
  stock_take: number;
  cash_banked: number;
  variance: number;
}

export default function MonthlySummaryPage() {
  const supabase = createClient();
  const [data, setData] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*, cashup_online_payments(amount)")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      if (cashups) {
        const byDate = new Map<string, SummaryRow>();
        for (const c of cashups as (DailyCashup & { cashup_online_payments: { amount: number | null }[] })[]) {
          const onlineTotal = (c.cashup_online_payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
          const turnover = c.gross_turnover ?? 0;
          const disc = c.discounts ?? 0;
          const delCharges = c.delivery_charges ?? 0;
          const cc = c.credit_cards ?? 0;
          const debtors = c.debtors ?? 0;
          const stockTake = c.stock_take ?? 0;
          const banked = c.cash_banked ?? 0;
          const variance = banked + (c.cc_batch_total ?? 0) - (turnover - disc);

          const existing = byDate.get(c.date);
          if (existing) {
            existing.turnover += turnover;
            existing.discounts += disc;
            existing.delivery_charges += delCharges;
            existing.credit_cards += cc;
            existing.debtors += debtors;
            existing.online_payments += onlineTotal;
            existing.stock_take += stockTake;
            existing.cash_banked += banked;
            existing.variance += variance;
          } else {
            byDate.set(c.date, { date: c.date, turnover, discounts: disc, delivery_charges: delCharges, credit_cards: cc, debtors, online_payments: onlineTotal, stock_take: stockTake, cash_banked: banked, variance });
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
    const headers = ["Date", "Turnover", "Discounts", "Del Charges", "Credit Cards", "Debtors", "Online Payments", "Stock Take", "Cash Banked", "Variance"];
    const rows = data.map((r) => [r.date, r.turnover, r.discounts, r.delivery_charges, r.credit_cards, r.debtors, r.online_payments, r.stock_take, r.cash_banked, r.variance]);
    triggerDownload(generateCSV(headers, rows), "monthly-summary.csv", "text/csv");
  }, [data]);

  const totalTurnover = data.reduce((s, r) => s + r.turnover, 0);
  const avgDaily = data.length > 0 ? totalTurnover / data.length : 0;
  const highestDay = data.length > 0 ? Math.max(...data.map((r) => r.turnover)) : 0;
  const lowestDay = data.length > 0 ? Math.min(...data.map((r) => r.turnover)) : 0;
  const colHeaders = ["Date", "Turnover", "Discounts", "Del Charges", "Credit Cards", "Debtors", "Online Payments", "Stock Take", "Cash Banked", "Variance"];

  return (
    <ReportWrapper title="Monthly Summary" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Month Total Turnover" value={formatCurrency(totalTurnover)} icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard label="Average Daily" value={formatCurrency(avgDaily)} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Highest Day" value={formatCurrency(highestDay)} icon={<ArrowUp className="h-5 w-5" />} />
        <StatCard label="Lowest Day" value={formatCurrency(lowestDay)} icon={<ArrowDown className="h-5 w-5" />} />
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
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {colHeaders.map((h) => (
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
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.turnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.discounts)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.delivery_charges)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.credit_cards)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.debtors)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.online_payments)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.stock_take)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.cash_banked)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.variance < 0 ? "text-red-600" : "text-green-600")}>
                    {formatCurrency(row.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                {[
                  data.reduce((s, r) => s + r.turnover, 0),
                  data.reduce((s, r) => s + r.discounts, 0),
                  data.reduce((s, r) => s + r.delivery_charges, 0),
                  data.reduce((s, r) => s + r.credit_cards, 0),
                  data.reduce((s, r) => s + r.debtors, 0),
                  data.reduce((s, r) => s + r.online_payments, 0),
                  data.reduce((s, r) => s + r.stock_take, 0),
                  data.reduce((s, r) => s + r.cash_banked, 0),
                ].map((v, i) => (
                  <td key={i} className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(v)}</td>
                ))}
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", data.reduce((s, r) => s + r.variance, 0) < 0 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(data.reduce((s, r) => s + r.variance, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
