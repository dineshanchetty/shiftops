"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { CreditCard } from "lucide-react";

interface CCRow {
  date: string;
  dateFormatted: string;
  creditCardsCashUp: number;
  ccBatchTotal: number;
  varianceAdmin: number;
  creditCardsBanked: number;
  varianceBanked: number;
  comment: string;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDDMMYYYY(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function MonthlyCCPage() {
  const supabase = createClient();
  const [data, setData] = useState<CCRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      // Parse month from selectedMonth (YYYY-MM)
      const [yearStr, monthStr] = selectedMonth.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-indexed
      const daysInMonth = getDaysInMonth(year, month);

      const dateFrom = `${yearStr}-${monthStr}-01`;
      const dateTo = `${yearStr}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*")
        .in("branch_id", f.branchIds)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });

      // Build a map of date -> aggregated values from cashups
      const dateMap = new Map<
        string,
        { creditCardsCashUp: number; ccBatchTotal: number }
      >();
      if (cashups) {
        for (const c of cashups as DailyCashup[]) {
          const cc = c.credit_cards ?? 0;
          const batch = c.cc_batch_total ?? 0;
          const existing = dateMap.get(c.date);
          if (existing) {
            existing.creditCardsCashUp += cc;
            existing.ccBatchTotal += batch;
          } else {
            dateMap.set(c.date, { creditCardsCashUp: cc, ccBatchTotal: batch });
          }
        }
      }

      // Build rows for EVERY day of the month
      const rows: CCRow[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
        const dayData = dateMap.get(dateStr);
        const ccCashUp = dayData?.creditCardsCashUp ?? 0;
        const ccBatch = dayData?.ccBatchTotal ?? 0;
        const varianceAdmin = ccCashUp - ccBatch;
        const ccBanked = 0; // TODO: separate banking field
        const varianceBanked = ccCashUp - ccBanked;

        rows.push({
          date: dateStr,
          dateFormatted: formatDDMMYYYY(dateStr),
          creditCardsCashUp: ccCashUp,
          ccBatchTotal: ccBatch,
          varianceAdmin,
          creditCardsBanked: ccBanked,
          varianceBanked,
          comment: comments[dateStr] ?? "",
        });
      }

      setData(rows);
      setLoading(false);
    },
    [supabase, selectedMonth, comments]
  );

  const handleCommentChange = useCallback(
    (date: string, value: string) => {
      setComments((prev) => ({ ...prev, [date]: value }));
      setData((prev) =>
        prev.map((r) => (r.date === date ? { ...r, comment: value } : r))
      );
    },
    []
  );

  const handleSaveComments = useCallback(() => {
    // TODO: persist comments to database
    alert("Comments saved locally.");
  }, []);

  const handlePrintView = useCallback(() => {
    window.print();
  }, []);

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Date",
      "Credit Cards - Cash Up",
      "Credit Card - Batch Total",
      "Variance (Admin)",
      "Credit Cards Banked",
      "Variance (Banked)",
      "Comments",
    ];
    const csvRows = data.map((r) => [
      r.dateFormatted,
      r.creditCardsCashUp,
      r.ccBatchTotal,
      r.varianceAdmin,
      r.creditCardsBanked,
      r.varianceBanked,
      r.comment,
    ]);

    // Total row
    const totals = data.reduce(
      (acc, r) => ({
        ccCashUp: acc.ccCashUp + r.creditCardsCashUp,
        ccBatch: acc.ccBatch + r.ccBatchTotal,
        varAdmin: acc.varAdmin + r.varianceAdmin,
        ccBanked: acc.ccBanked + r.creditCardsBanked,
        varBanked: acc.varBanked + r.varianceBanked,
      }),
      { ccCashUp: 0, ccBatch: 0, varAdmin: 0, ccBanked: 0, varBanked: 0 }
    );
    csvRows.push([
      "Total",
      totals.ccCashUp,
      totals.ccBatch,
      totals.varAdmin,
      totals.ccBanked,
      totals.varBanked,
      "",
    ]);

    triggerDownload(
      generateCSV(headers, csvRows),
      "monthly-cc-summary.csv",
      "text/csv"
    );
  }, [data]);

  const totals = data.reduce(
    (acc, r) => ({
      ccCashUp: acc.ccCashUp + r.creditCardsCashUp,
      ccBatch: acc.ccBatch + r.ccBatchTotal,
      varAdmin: acc.varAdmin + r.varianceAdmin,
      ccBanked: acc.ccBanked + r.creditCardsBanked,
      varBanked: acc.varBanked + r.varianceBanked,
    }),
    { ccCashUp: 0, ccBatch: 0, varAdmin: 0, ccBanked: 0, varBanked: 0 }
  );

  return (
    <ReportWrapper
      title="Monthly Credit Card Summary"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Month picker — overrides the date range from ReportWrapper */}
      <div className="flex items-end gap-3 mb-6 print:hidden">
        <div>
          <label className="text-sm font-medium text-base-700 block mb-1.5">
            Month
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900"
          />
        </div>
        <button
          type="button"
          onClick={handlePrintView}
          className="h-10 px-4 rounded-lg border border-base-200 bg-surface text-sm text-base-700 hover:bg-surface-2 transition-colors"
        >
          Print View
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <CreditCard className="h-12 w-12 mb-3" />
          <p className="text-sm">
            Select a branch and click Run Report to view data
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2">
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-left">
                    Date
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-right">
                    Credit Cards - Cash Up
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-right">
                    Credit Card - Batch Total
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-right">
                    Variance (Admin)
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-right">
                    Credit Cards Banked
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-right">
                    Variance (Banked)
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 text-left">
                    Comments
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr
                    key={row.date}
                    className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 py-2 text-base-900">
                      {row.dateFormatted}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.creditCardsCashUp)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.ccBatchTotal)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right font-mono font-semibold",
                        row.varianceAdmin < 0
                          ? "text-red-600"
                          : "text-base-900"
                      )}
                    >
                      {formatCurrency(row.varianceAdmin)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.creditCardsBanked)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right font-mono font-semibold",
                        row.varianceBanked < 0
                          ? "text-red-600"
                          : "text-base-900"
                      )}
                    >
                      {formatCurrency(row.varianceBanked)}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.comment}
                        onChange={(e) =>
                          handleCommentChange(row.date, e.target.value)
                        }
                        className="w-full h-8 px-2 rounded border border-base-200 bg-surface text-sm text-base-900"
                        placeholder="Add comment..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-4 py-2 text-base-900">Total</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(totals.ccCashUp)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(totals.ccBatch)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono font-semibold",
                      totals.varAdmin < 0 ? "text-red-600" : "text-base-900"
                    )}
                  >
                    {formatCurrency(totals.varAdmin)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(totals.ccBanked)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono font-semibold",
                      totals.varBanked < 0 ? "text-red-600" : "text-base-900"
                    )}
                  >
                    {formatCurrency(totals.varBanked)}
                  </td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 print:hidden">
            <button
              type="button"
              onClick={handleSaveComments}
              className="h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              Save Comments
            </button>
          </div>
        </>
      )}
    </ReportWrapper>
  );
}
