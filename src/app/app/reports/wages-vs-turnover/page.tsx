"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { TrendingUp, DollarSign, Receipt, CalendarDays } from "lucide-react";

const LABOUR_TARGET = 25;
const DEFAULT_HOURLY_RATE = 35; // R35/hr default for roster staff

interface WagesRow {
  date: string;
  turnover: number;
  total_wages: number;
  labour_pct: number;
  target_pct: number;
  over_under: number;
}

export default function WagesVsTurnoverPage() {
  const supabase = createClient();
  const [data, setData] = useState<WagesRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      // Fetch cashups with driver wages
      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*, cashup_driver_entries(wages)")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      // Fetch roster entries for FOH/BOH staff wages
      const { data: rosterEntries } = await supabase
        .from("roster_entries")
        .select("date, shift_hours, is_off")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .eq("is_off", false);

      // Build roster wages by date
      const rosterWagesByDate = new Map<string, number>();
      if (rosterEntries) {
        for (const re of rosterEntries as { date: string; shift_hours: number | null; is_off: boolean }[]) {
          const hours = re.shift_hours ?? 0;
          const existing = rosterWagesByDate.get(re.date) ?? 0;
          rosterWagesByDate.set(re.date, existing + hours * DEFAULT_HOURLY_RATE);
        }
      }

      if (cashups) {
        const byDate = new Map<string, WagesRow>();
        for (const c of cashups as (Record<string, unknown> & { date: string; gross_turnover: number | null; cashup_driver_entries: { wages: number | null }[] })[]) {
          const turnover = c.gross_turnover ?? 0;
          const driverWages = (c.cashup_driver_entries ?? []).reduce((s, d) => s + (d.wages ?? 0), 0);
          const rosterWages = rosterWagesByDate.get(c.date) ?? 0;
          const totalWages = driverWages + rosterWages;

          const existing = byDate.get(c.date);
          if (existing) {
            existing.turnover += turnover;
            existing.total_wages += totalWages;
            existing.labour_pct = existing.turnover > 0 ? (existing.total_wages / existing.turnover) * 100 : 0;
            existing.over_under = existing.labour_pct - LABOUR_TARGET;
          } else {
            const pct = turnover > 0 ? (totalWages / turnover) * 100 : 0;
            byDate.set(c.date, { date: c.date, turnover, total_wages: totalWages, labour_pct: pct, target_pct: LABOUR_TARGET, over_under: pct - LABOUR_TARGET });
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
    const headers = ["Date", "Turnover", "Total Wages", "Labour %", "Target %", "Over/Under"];
    const rows = data.map((r) => [r.date, r.turnover, r.total_wages, `${r.labour_pct.toFixed(1)}%`, `${r.target_pct}%`, `${r.over_under.toFixed(1)}%`]);
    triggerDownload(generateCSV(headers, rows), "wages-vs-turnover.csv", "text/csv");
  }, [data]);

  const totalTurnover = data.reduce((s, r) => s + r.turnover, 0);
  const totalWages = data.reduce((s, r) => s + r.total_wages, 0);
  const avgLabour = totalTurnover > 0 ? (totalWages / totalTurnover) * 100 : 0;

  return (
    <ReportWrapper title="Wages vs Turnover" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Average Labour %" value={`${avgLabour.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total Wages" value={formatCurrency(totalWages)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Total Turnover" value={formatCurrency(totalTurnover)} icon={<Receipt className="h-5 w-5" />} />
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
                {["Date", "Turnover", "Total Wages", "Labour %", "Target %", "Over/Under"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Date" ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className={cn("border-b border-base-200 hover:bg-surface-2 transition-colors", row.labour_pct > LABOUR_TARGET && "bg-red-50")}>
                  <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.turnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.total_wages)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.labour_pct > LABOUR_TARGET ? "text-red-600" : "text-green-600")}>{row.labour_pct.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right font-mono text-base-400">{row.target_pct}%</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.over_under > 0 ? "text-red-600" : "text-green-600")}>{row.over_under > 0 ? "+" : ""}{row.over_under.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalTurnover)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalWages)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", avgLabour > LABOUR_TARGET ? "text-red-600" : "text-green-600")}>{avgLabour.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right font-mono text-base-400">{LABOUR_TARGET}%</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", avgLabour - LABOUR_TARGET > 0 ? "text-red-600" : "text-green-600")}>{avgLabour - LABOUR_TARGET > 0 ? "+" : ""}{(avgLabour - LABOUR_TARGET).toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
