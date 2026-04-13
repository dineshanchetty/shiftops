"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Banknote, CreditCard, AlertTriangle, CalendarDays } from "lucide-react";

interface CashBankedRow {
  date: string;
  grossTurnover: number;
  dailyBanking: number;
  cashBanked: number;
  variance: number;
  ccBatch: number;
  shopFloat: number;
}

export default function CashBankedPage() {
  const supabase = createClient();
  const [data, setData] = useState<CashBankedRow[]>([]);
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

      if (!cashups || cashups.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Get online payments for these cashups
      const cashupIds = (cashups as DailyCashup[]).map((c) => c.id);
      const { data: onlinePayments } = await supabase
        .from("cashup_online_payments")
        .select("cashup_id, amount")
        .in("cashup_id", cashupIds);

      // Sum online payments per cashup
      const onlineMap = new Map<string, number>();
      if (onlinePayments) {
        for (const op of onlinePayments) {
          onlineMap.set(op.cashup_id, (onlineMap.get(op.cashup_id) ?? 0) + (op.amount ?? 0));
        }
      }

      const byDate = new Map<string, CashBankedRow>();
      for (const c of cashups as DailyCashup[]) {
        const gross = c.gross_turnover ?? 0;
        const disc = c.discounts ?? 0;
        const delCharges = c.delivery_charges ?? 0;
        const cc = c.credit_cards ?? 0;
        const debtors = c.debtors ?? 0;
        const onlineTotal = onlineMap.get(c.id) ?? 0;
        const banked = c.cash_banked ?? 0;
        const batch = c.cc_batch_total ?? 0;
        const shopFloat = c.shop_float ?? 0;

        // Daily Banking = Turnover - Discounts + Del Charges - CC - Debtors - Online Payments
        const dailyBanking = gross - disc + delCharges - cc - debtors - onlineTotal;
        const variance = dailyBanking - banked;

        const existing = byDate.get(c.date);
        if (existing) {
          existing.grossTurnover += gross;
          existing.dailyBanking += dailyBanking;
          existing.cashBanked += banked;
          existing.variance += variance;
          existing.ccBatch += batch;
          existing.shopFloat += shopFloat;
        } else {
          byDate.set(c.date, {
            date: c.date,
            grossTurnover: gross,
            dailyBanking: dailyBanking,
            cashBanked: banked,
            variance,
            ccBatch: batch,
            shopFloat,
          });
        }
      }

      setData(Array.from(byDate.values()));
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Gross Turnover", "Daily Banking", "Cash Banked", "Variance", "CC Batch", "Shop Float"];
    const rows = data.map((r) => [r.date, r.grossTurnover, r.dailyBanking, r.cashBanked, r.variance, r.ccBatch, r.shopFloat]);
    triggerDownload(generateCSV(headers, rows), "cash-banked-report.csv", "text/csv");
  }, [data]);

  const totals = data.reduce(
    (acc, r) => ({
      cashBanked: acc.cashBanked + r.cashBanked,
      ccBatch: acc.ccBatch + r.ccBatch,
      variance: acc.variance + r.variance,
    }),
    { cashBanked: 0, ccBatch: 0, variance: 0 }
  );
  const daysWithVariance = data.filter((r) => Math.abs(r.variance) > 0.01).length;

  return (
    <ReportWrapper title="Cash Banked Report" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Cash Banked" value={formatCurrency(totals.cashBanked)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Total CC Batch" value={formatCurrency(totals.ccBatch)} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Total Variance" value={formatCurrency(totals.variance)} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Days with Variance" value={daysWithVariance} icon={<CalendarDays className="h-5 w-5" />} />
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
          <Banknote className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Date", "Gross Turnover", "Daily Banking", "Cash Banked", "Variance", "CC Batch", "Shop Float"].map((h) => (
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
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.grossTurnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.dailyBanking)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.cashBanked)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", Math.abs(row.variance) > 0.01 ? "text-red-600" : "text-green-600")}>
                    {formatCurrency(row.variance)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.ccBatch)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.shopFloat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.grossTurnover, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.dailyBanking, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.cashBanked)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", Math.abs(totals.variance) > 0.01 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(totals.variance)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totals.ccBatch)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.shopFloat, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
