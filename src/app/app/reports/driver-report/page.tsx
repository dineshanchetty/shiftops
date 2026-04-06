"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Truck, Users, DollarSign, CalendarDays } from "lucide-react";

interface DriverRow {
  staff_id: string;
  name: string;
  total_deliveries: number;
  total_turnover: number;
  total_wages: number;
  total_fuel: number;
  total_gratuities: number;
  avg_per_delivery: number;
}

export default function DriverReportPage() {
  const supabase = createClient();
  const [data, setData] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalDays, setTotalDays] = useState(0);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id, date")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo);

      if (!cashups || cashups.length === 0) {
        setData([]);
        setTotalDays(0);
        setLoading(false);
        return;
      }

      const cashupIds = cashups.map((c) => c.id);
      setTotalDays(new Set(cashups.map((c) => c.date)).size);

      const { data: entries } = await supabase
        .from("cashup_driver_entries")
        .select("*, staff(first_name, last_name)")
        .in("cashup_id", cashupIds);

      if (entries) {
        const byDriver = new Map<string, DriverRow>();
        for (const e of entries as (Record<string, unknown> & { staff_id: string; delivery_count: number | null; turnover: number | null; wages: number | null; fuel_cost: number | null; gratuities: number | null; staff: { first_name: string; last_name: string } | null })[]) {
          const staffName = e.staff ? `${e.staff.first_name} ${e.staff.last_name}` : "Unknown";
          const deliveries = e.delivery_count ?? 0;
          const turnover = e.turnover ?? 0;
          const wages = e.wages ?? 0;
          const fuel = e.fuel_cost ?? 0;
          const grat = e.gratuities ?? 0;

          const existing = byDriver.get(e.staff_id);
          if (existing) {
            existing.total_deliveries += deliveries;
            existing.total_turnover += turnover;
            existing.total_wages += wages;
            existing.total_fuel += fuel;
            existing.total_gratuities += grat;
            existing.avg_per_delivery = existing.total_deliveries > 0 ? existing.total_turnover / existing.total_deliveries : 0;
          } else {
            byDriver.set(e.staff_id, { staff_id: e.staff_id, name: staffName, total_deliveries: deliveries, total_turnover: turnover, total_wages: wages, total_fuel: fuel, total_gratuities: grat, avg_per_delivery: deliveries > 0 ? turnover / deliveries : 0 });
          }
        }
        setData(Array.from(byDriver.values()).sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setData([]);
      }
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Driver Name", "Total Deliveries", "Total Turnover", "Total Wages", "Total Fuel", "Total Gratuities", "Avg per Delivery"];
    const rows = data.map((r) => [r.name, r.total_deliveries, r.total_turnover, r.total_wages, r.total_fuel, r.total_gratuities, r.avg_per_delivery]);
    triggerDownload(generateCSV(headers, rows), "driver-report.csv", "text/csv");
  }, [data]);

  const totalDeliveries = data.reduce((s, r) => s + r.total_deliveries, 0);
  const totalWages = data.reduce((s, r) => s + r.total_wages, 0);
  const avgDeliveriesPerDay = totalDays > 0 ? totalDeliveries / totalDays : 0;

  return (
    <ReportWrapper title="Driver Report" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Drivers" value={data.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Total Deliveries" value={totalDeliveries} icon={<Truck className="h-5 w-5" />} />
        <StatCard label="Total Driver Wages" value={formatCurrency(totalWages)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Avg Deliveries/Day" value={avgDeliveriesPerDay.toFixed(1)} icon={<CalendarDays className="h-5 w-5" />} />
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
          <Truck className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Driver Name", "Total Deliveries", "Total Turnover", "Total Wages", "Total Fuel", "Total Gratuities", "Avg per Delivery"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Driver Name" ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.staff_id} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.total_deliveries}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.total_turnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.total_wages)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.total_fuel)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.total_gratuities)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.avg_per_delivery)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{totalDeliveries}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.total_turnover, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalWages)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.total_fuel, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.total_gratuities, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalDeliveries > 0 ? data.reduce((s, r) => s + r.total_turnover, 0) / totalDeliveries : 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
