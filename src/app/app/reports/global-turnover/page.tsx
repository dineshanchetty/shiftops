"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { Branch } from "@/lib/types";
import { Globe, ArrowUp, ArrowDown, CalendarDays } from "lucide-react";

interface GlobalRow {
  date: string;
  branchTotals: Record<string, number>;
  total: number;
}

export default function GlobalTurnoverPage() {
  const supabase = createClient();
  const [data, setData] = useState<GlobalRow[]>([]);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [branchOrder, setBranchOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: branches } = await supabase.from("branches").select("id, name").in("id", f.branchIds);
      const names: Record<string, string> = {};
      for (const b of (branches ?? []) as Branch[]) names[b.id] = b.name;
      setBranchNames(names);
      setBranchOrder(f.branchIds);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("date, branch_id, gross_turnover")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      if (cashups) {
        const byDate = new Map<string, GlobalRow>();
        for (const c of cashups as { date: string; branch_id: string; gross_turnover: number | null }[]) {
          const turnover = c.gross_turnover ?? 0;
          const existing = byDate.get(c.date);
          if (existing) {
            existing.branchTotals[c.branch_id] = (existing.branchTotals[c.branch_id] ?? 0) + turnover;
            existing.total += turnover;
          } else {
            byDate.set(c.date, { date: c.date, branchTotals: { [c.branch_id]: turnover }, total: turnover });
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
    const headers = ["Date", ...branchOrder.map((id) => branchNames[id] ?? id), "Total"];
    const rows = data.map((r) => [r.date, ...branchOrder.map((id) => r.branchTotals[id] ?? 0), r.total]);
    triggerDownload(generateCSV(headers, rows), "global-turnover.csv", "text/csv");
  }, [data, branchOrder, branchNames]);

  const grandTotal = data.reduce((s, r) => s + r.total, 0);
  const branchGrandTotals = branchOrder.map((id) => ({ id, name: branchNames[id] ?? id, total: data.reduce((s, r) => s + (r.branchTotals[id] ?? 0), 0) }));
  const highest = branchGrandTotals.length > 0 ? branchGrandTotals.reduce((a, b) => (a.total > b.total ? a : b)) : null;
  const lowest = branchGrandTotals.length > 0 ? branchGrandTotals.reduce((a, b) => (a.total < b.total ? a : b)) : null;

  return (
    <ReportWrapper title="Global Turnover" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total All Branches" value={formatCurrency(grandTotal)} icon={<Globe className="h-5 w-5" />} />
        <StatCard label="Highest Branch" value={highest ? highest.name : "-"} icon={<ArrowUp className="h-5 w-5" />} />
        <StatCard label="Lowest Branch" value={lowest ? lowest.name : "-"} icon={<ArrowDown className="h-5 w-5" />} />
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
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2">Date</th>
                {branchOrder.map((id) => (
                  <th key={id} className="text-right px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2">{branchNames[id] ?? id}</th>
                ))}
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                  {branchOrder.map((id) => (
                    <td key={id} className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.branchTotals[id] ?? 0)}</td>
                  ))}
                  <td className="px-4 py-2 text-right font-mono font-semibold text-base-900">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                {branchGrandTotals.map((bt) => (
                  <td key={bt.id} className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(bt.total)}</td>
                ))}
                <td className="px-4 py-2 text-right font-mono font-semibold text-base-900">{formatCurrency(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
