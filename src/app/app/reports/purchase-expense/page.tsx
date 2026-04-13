"use client";

import React, { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { ShoppingCart, Receipt, DollarSign, CalendarDays } from "lucide-react";

interface ExpenseRow {
  date: string;
  category: string;
  description: string;
  amount: number;
  type: "Purchase" | "Expense";
}

export default function PurchaseExpensePage() {
  const supabase = createClient();
  const [data, setData] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      // Fetch cashups for the period to get cashup IDs and dates
      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id, date")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo);

      if (!cashups || cashups.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const cashupIds = cashups.map((c) => c.id);
      const dateMap = new Map(cashups.map((c) => [c.id, c.date]));

      // Fetch purchases and expenses in parallel
      const [{ data: purchases }, { data: expenses }] = await Promise.all([
        supabase
          .from("cashup_purchases")
          .select("*")
          .in("cashup_id", cashupIds),
        supabase
          .from("cashup_expenses")
          .select("*")
          .in("cashup_id", cashupIds),
      ]);

      const rows: ExpenseRow[] = [];

      if (purchases) {
        for (const p of purchases) {
          rows.push({
            date: dateMap.get(p.cashup_id) ?? "",
            category: p.item_type ?? "Uncategorised",
            description: p.item_type ?? "",
            amount: p.amount ?? 0,
            type: "Purchase",
          });
        }
      }

      if (expenses) {
        for (const e of expenses) {
          rows.push({
            date: dateMap.get(e.cashup_id) ?? "",
            category: e.category ?? "Uncategorised",
            description: e.description ?? "",
            amount: e.amount ?? 0,
            type: "Expense",
          });
        }
      }

      rows.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
      setData(rows);
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Category", "Description", "Amount", "Type"];
    const rows = data.map((r) => [r.date, r.category, r.description, r.amount, r.type]);
    triggerDownload(generateCSV(headers, rows), "purchase-expense-report.csv", "text/csv");
  }, [data]);

  const totalPurchases = data.filter((r) => r.type === "Purchase").reduce((s, r) => s + r.amount, 0);
  const totalExpenses = data.filter((r) => r.type === "Expense").reduce((s, r) => s + r.amount, 0);
  const combinedTotal = totalPurchases + totalExpenses;

  // Group by category for subtotals
  const categoryTotals = new Map<string, number>();
  for (const r of data) {
    categoryTotals.set(r.category, (categoryTotals.get(r.category) ?? 0) + r.amount);
  }

  return (
    <ReportWrapper title="Purchase / Expense Report" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Purchases" value={formatCurrency(totalPurchases)} icon={<ShoppingCart className="h-5 w-5" />} />
        <StatCard label="Total Expenses" value={formatCurrency(totalExpenses)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Combined Total" value={formatCurrency(combinedTotal)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Line Items" value={data.length} icon={<CalendarDays className="h-5 w-5" />} />
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
          <ShoppingCart className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Date", "Category", "Description", "Amount", "Type"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Amount" ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(categoryTotals.keys())
                .sort()
                .map((cat) => {
                  const catRows = data.filter((r) => r.category === cat);
                  return (
                    <React.Fragment key={cat}>
                      {catRows.map((row, i) => (
                        <tr key={`${cat}-${i}`} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                          <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                          <td className="px-4 py-2 text-base-900">{row.category}</td>
                          <td className="px-4 py-2 text-base-900">{row.description}</td>
                          <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.amount)}</td>
                          <td className="px-4 py-2 text-base-900">
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", row.type === "Purchase" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")}>
                              {row.type}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-surface-2/50 font-semibold">
                        <td className="px-4 py-1.5 text-base-400 text-xs" colSpan={3}>
                          Subtotal: {cat}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-base-900 text-xs">
                          {formatCurrency(categoryTotals.get(cat) ?? 0)}
                        </td>
                        <td />
                      </tr>
                    </React.Fragment>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900" colSpan={3}>Grand Total</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(combinedTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
