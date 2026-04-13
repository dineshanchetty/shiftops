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
import { Banknote } from "lucide-react";

interface CashBankedRow {
  branchId: string;
  branchName: string;
  bankingRecon: number;
  actualBanking: number;
  bankingVariance: number;
  comment: string;
}

export default function CashBankedPage() {
  const supabase = createClient();
  const [data, setData] = useState<CashBankedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});

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

      const branchMap = new Map(
        (branches ?? []).map((b) => [b.id, b.name as string])
      );

      // Get online payments for these cashups
      const cashupIds = (cashups as DailyCashup[]).map((c) => c.id);
      const { data: onlinePayments } = await supabase
        .from("cashup_online_payments")
        .select("cashup_id, amount")
        .in("cashup_id", cashupIds);

      const onlineMap = new Map<string, number>();
      if (onlinePayments) {
        for (const op of onlinePayments) {
          onlineMap.set(
            op.cashup_id,
            (onlineMap.get(op.cashup_id) ?? 0) + (op.amount ?? 0)
          );
        }
      }

      // Aggregate per branch
      const branchAgg = new Map<
        string,
        { bankingRecon: number; actualBanking: number }
      >();

      for (const c of cashups as DailyCashup[]) {
        const gross = c.gross_turnover ?? 0;
        const disc = c.discounts ?? 0;
        const delCharges = c.delivery_charges ?? 0;
        const cc = c.credit_cards ?? 0;
        const debtors = c.debtors ?? 0;
        const onlineTotal = onlineMap.get(c.id) ?? 0;
        const banked = c.cash_banked ?? 0;

        // Banking Recon = Turnover - Discounts + Del Charges - CC - Debtors - Online
        const dailyBanking = gross - disc + delCharges - cc - debtors - onlineTotal;

        const existing = branchAgg.get(c.branch_id);
        if (existing) {
          existing.bankingRecon += dailyBanking;
          existing.actualBanking += banked;
        } else {
          branchAgg.set(c.branch_id, {
            bankingRecon: dailyBanking,
            actualBanking: banked,
          });
        }
      }

      const rows: CashBankedRow[] = Array.from(branchAgg.entries()).map(
        ([branchId, agg]) => ({
          branchId,
          branchName: branchMap.get(branchId) ?? "Unknown",
          bankingRecon: agg.bankingRecon,
          actualBanking: agg.actualBanking,
          bankingVariance: agg.bankingRecon - agg.actualBanking,
          comment: comments[branchId] ?? "",
        })
      );

      rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
      setData(rows);
      setLoading(false);
    },
    [supabase, comments]
  );

  const handleCommentChange = useCallback(
    (branchId: string, value: string) => {
      setComments((prev) => ({ ...prev, [branchId]: value }));
      setData((prev) =>
        prev.map((r) =>
          r.branchId === branchId ? { ...r, comment: value } : r
        )
      );
    },
    []
  );

  const handleSaveComments = useCallback(() => {
    // TODO: persist comments to database
    alert("Comments saved locally.");
  }, []);

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Branch",
      "Banking Recon",
      "Actual Banking",
      "Banking Variance",
      "Comment",
    ];
    const rows = data.map((r) => [
      r.branchName,
      r.bankingRecon,
      r.actualBanking,
      r.bankingVariance,
      r.comment,
    ]);

    // Total row
    const totalRecon = data.reduce((s, r) => s + r.bankingRecon, 0);
    const totalActual = data.reduce((s, r) => s + r.actualBanking, 0);
    rows.push(["Total", totalRecon, totalActual, totalRecon - totalActual, ""]);

    triggerDownload(
      generateCSV(headers, rows),
      "cash-banked-report.csv",
      "text/csv"
    );
  }, [data]);

  const totalRecon = data.reduce((s, r) => s + r.bankingRecon, 0);
  const totalActual = data.reduce((s, r) => s + r.actualBanking, 0);
  const totalVariance = totalRecon - totalActual;

  return (
    <ReportWrapper
      title="Cash Banked Report"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
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
        <>
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2">
                  {[
                    "Branch",
                    "Banking Recon",
                    "Actual Banking",
                    "Banking Variance",
                    "Comment",
                  ].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2",
                        h === "Branch" || h === "Comment"
                          ? "text-left"
                          : "text-right"
                      )}
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
                    <td className="px-4 py-2 text-base-900 font-medium">
                      {row.branchName}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.bankingRecon)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.actualBanking)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right font-mono font-semibold",
                        row.bankingVariance < 0
                          ? "text-red-600"
                          : "text-base-900"
                      )}
                    >
                      {formatCurrency(row.bankingVariance)}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.comment}
                        onChange={(e) =>
                          handleCommentChange(row.branchId, e.target.value)
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
                    {formatCurrency(totalRecon)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(totalActual)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono font-semibold",
                      totalVariance < 0 ? "text-red-600" : "text-base-900"
                    )}
                  >
                    {formatCurrency(totalVariance)}
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
