"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Users, Truck, DollarSign, CalendarDays } from "lucide-react";

interface DriverRow {
  staffId: string;
  name: string;
  daysWorked: number;
  totalDeliveries: number;
  totalTurnover: number;
  totalWages: number;
  totalFuel: number;
  totalGratuities: number;
  avgDeliveriesPerDay: number;
  avgTurnoverPerDay: number;
}

export default function DriverSummaryPage() {
  const supabase = createClient();
  const [data, setData] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo);

      if (!cashups || cashups.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const cashupIds = cashups.map((c) => c.id);

      const [{ data: entries }, { data: staffList }] = await Promise.all([
        supabase
          .from("cashup_driver_entries")
          .select("*")
          .in("cashup_id", cashupIds),
        supabase.from("staff").select("id, first_name, last_name"),
      ]);

      if (!entries || entries.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const staffMap = new Map((staffList ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]));

      // Aggregate per driver
      const driverMap = new Map<string, {
        daysSet: Set<string>;
        deliveries: number;
        turnover: number;
        wages: number;
        fuel: number;
        gratuities: number;
      }>();

      for (const e of entries) {
        const existing = driverMap.get(e.staff_id) ?? {
          daysSet: new Set<string>(),
          deliveries: 0,
          turnover: 0,
          wages: 0,
          fuel: 0,
          gratuities: 0,
        };
        existing.daysSet.add(e.cashup_id);
        existing.deliveries += e.delivery_count ?? 0;
        existing.turnover += e.turnover ?? 0;
        existing.wages += e.wages ?? 0;
        existing.fuel += e.fuel_cost ?? 0;
        existing.gratuities += e.gratuities ?? 0;
        driverMap.set(e.staff_id, existing);
      }

      const rows: DriverRow[] = Array.from(driverMap.entries()).map(([staffId, d]) => {
        const days = d.daysSet.size;
        return {
          staffId,
          name: staffMap.get(staffId) ?? "Unknown",
          daysWorked: days,
          totalDeliveries: d.deliveries,
          totalTurnover: d.turnover,
          totalWages: d.wages,
          totalFuel: d.fuel,
          totalGratuities: d.gratuities,
          avgDeliveriesPerDay: days > 0 ? d.deliveries / days : 0,
          avgTurnoverPerDay: days > 0 ? d.turnover / days : 0,
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setData(rows);
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Driver Name", "Days Worked", "Total Deliveries", "Total Turnover", "Total Wages", "Total Fuel", "Total Gratuities", "Avg Deliveries/Day", "Avg Turnover/Day"];
    const rows = data.map((r) => [r.name, r.daysWorked, r.totalDeliveries, r.totalTurnover, r.totalWages, r.totalFuel, r.totalGratuities, r.avgDeliveriesPerDay.toFixed(1), r.avgTurnoverPerDay.toFixed(0)]);
    triggerDownload(generateCSV(headers, rows), "driver-summary.csv", "text/csv");
  }, [data]);

  const totalDrivers = data.length;
  const totalDeliveries = data.reduce((s, r) => s + r.totalDeliveries, 0);
  const totalWages = data.reduce((s, r) => s + r.totalWages, 0);
  const avgCostPerDelivery = totalDeliveries > 0 ? totalWages / totalDeliveries : 0;

  return (
    <ReportWrapper title="Driver Summary" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Drivers" value={totalDrivers} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Total Deliveries" value={totalDeliveries} icon={<Truck className="h-5 w-5" />} />
        <StatCard label="Total Driver Wages" value={formatCurrency(totalWages)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Avg Cost/Delivery" value={formatCurrency(avgCostPerDelivery)} icon={<CalendarDays className="h-5 w-5" />} />
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
          <Users className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Driver Name", "Days Worked", "Total Deliveries", "Total Turnover", "Total Wages", "Total Fuel", "Total Gratuities", "Avg Del/Day", "Avg Turn/Day"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Driver Name" ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.staffId} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.daysWorked}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.totalDeliveries}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.totalTurnover)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.totalWages)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.totalFuel)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.totalGratuities)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.avgDeliveriesPerDay.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.avgTurnoverPerDay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals ({totalDrivers} drivers)</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{data.reduce((s, r) => s + r.daysWorked, 0)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{totalDeliveries}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.totalTurnover, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(totalWages)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.totalFuel, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(data.reduce((s, r) => s + r.totalGratuities, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">-</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
