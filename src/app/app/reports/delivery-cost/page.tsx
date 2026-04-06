"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Package, DollarSign, TrendingUp, CalendarDays } from "lucide-react";

interface DeliveryCostRow {
  date: string;
  delivery_turnover: number;
  driver_wages: number;
  fuel_costs: number;
  total_del_cost: number;
  del_cost_pct: number;
  delivery_count: number;
}

export default function DeliveryCostPage() {
  const supabase = createClient();
  const [data, setData] = useState<DeliveryCostRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id, date, cashup_driver_entries(turnover, wages, fuel_cost, delivery_count)")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      if (cashups) {
        const byDate = new Map<string, DeliveryCostRow>();
        for (const c of cashups as (Record<string, unknown> & { date: string; cashup_driver_entries: { turnover: number | null; wages: number | null; fuel_cost: number | null; delivery_count: number | null }[] })[]) {
          const drivers = c.cashup_driver_entries ?? [];
          const delTurnover = drivers.reduce((s, d) => s + (d.turnover ?? 0), 0);
          const driverWages = drivers.reduce((s, d) => s + (d.wages ?? 0), 0);
          const fuelCosts = drivers.reduce((s, d) => s + (d.fuel_cost ?? 0), 0);
          const delCount = drivers.reduce((s, d) => s + (d.delivery_count ?? 0), 0);
          const totalCost = driverWages + fuelCosts;

          const existing = byDate.get(c.date);
          if (existing) {
            existing.delivery_turnover += delTurnover;
            existing.driver_wages += driverWages;
            existing.fuel_costs += fuelCosts;
            existing.total_del_cost += totalCost;
            existing.delivery_count += delCount;
            existing.del_cost_pct = existing.delivery_turnover > 0 ? (existing.total_del_cost / existing.delivery_turnover) * 100 : 0;
          } else {
            byDate.set(c.date, { date: c.date, delivery_turnover: delTurnover, driver_wages: driverWages, fuel_costs: fuelCosts, total_del_cost: totalCost, del_cost_pct: delTurnover > 0 ? (totalCost / delTurnover) * 100 : 0, delivery_count: delCount });
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
    const headers = ["Date", "Delivery Turnover", "Driver Wages", "Fuel Costs", "Total Del Cost", "Del Cost %"];
    const rows = data.map((r) => [r.date, r.delivery_turnover, r.driver_wages, r.fuel_costs, r.total_del_cost, `${r.del_cost_pct.toFixed(1)}%`]);
    triggerDownload(generateCSV(headers, rows), "delivery-cost.csv", "text/csv");
  }, [data]);

  const totalRevenue = data.reduce((s, r) => s + r.delivery_turnover, 0);
  const totalCost = data.reduce((s, r) => s + r.total_del_cost, 0);
  const totalDeliveries = data.reduce((s, r) => s + r.delivery_count, 0);
  const overallPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
  const avgCostPerDelivery = totalDeliveries > 0 ? totalCost / totalDeliveries : 0;

  return (
    <ReportWrapper title="Delivery Cost Analysis" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Del Revenue" value={formatCurrency(totalRevenue)} icon={<Package className="h-5 w-5" />} />
        <StatCard label="Total Del Cost" value={formatCurrency(totalCost)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Del Cost %" value={`${overallPct.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Avg Cost/Delivery" value={formatCurrency(avgCostPerDelivery)} icon={<Package className="h-5 w-5" />} />
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
                {["Date", "Delivery Turnover", "Driver Wages", "Fuel Costs", "Total Del Cost", "Del Cost %"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Date" ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.delivery_turnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.driver_wages)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.fuel_costs)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.total_del_cost)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.del_cost_pct > 30 ? "text-red-600" : "text-green-600")}>{row.del_cost_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalRevenue)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.driver_wages, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.fuel_costs, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalCost)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", overallPct > 30 ? "text-red-600" : "text-green-600")}>{overallPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
