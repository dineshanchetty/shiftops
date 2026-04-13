"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Users } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────



// ─── Types ─────────────────────────────────────────────────────────────────

interface DriverRow {
  staffId: string;
  name: string;
  totalTO: number;
  totalWages: number;
  totalFuel: number;
  totalGratuities: number;
  numDeliveries: number;
  wageRatePerDelivery: number;
  ratePerDelivery: number;
  wagesPctTO: number;
}

// ─── Page ──────────────────────────────────────────────────────────────────

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

      const staffMap = new Map(
        (staffList ?? []).map((s) => [
          s.id,
          `${s.first_name} ${s.last_name}`,
        ])
      );

      // Aggregate per driver
      const driverMap = new Map<
        string,
        {
          turnover: number;
          wages: number;
          fuel: number;
          gratuities: number;
          deliveries: number;
        }
      >();

      for (const e of entries) {
        const existing = driverMap.get(e.staff_id) ?? {
          turnover: 0,
          wages: 0,
          fuel: 0,
          gratuities: 0,
          deliveries: 0,
        };
        existing.turnover += e.turnover ?? 0;
        existing.wages += e.wages ?? 0;
        existing.fuel += e.fuel_cost ?? 0;
        existing.gratuities += e.gratuities ?? 0;
        existing.deliveries += e.delivery_count ?? 0;
        driverMap.set(e.staff_id, existing);
      }

      const rows: DriverRow[] = Array.from(driverMap.entries()).map(
        ([staffId, d]) => {
          const wageRate =
            d.deliveries > 0 ? d.wages / d.deliveries : 0;
          const toRate =
            d.deliveries > 0 ? d.turnover / d.deliveries : 0;
          const wagesPct =
            d.turnover > 0 ? (d.wages / d.turnover) * 100 : 0;
          return {
            staffId,
            name: staffMap.get(staffId) ?? "Unknown",
            totalTO: d.turnover,
            totalWages: d.wages,
            totalFuel: d.fuel,
            totalGratuities: d.gratuities,
            numDeliveries: d.deliveries,
            wageRatePerDelivery: wageRate,
            ratePerDelivery: toRate,
            wagesPctTO: wagesPct,
          };
        }
      );

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setData(rows);
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Driver Name",
      "Total T/O",
      "Total Salary/Wages",
      "Total Fuel Cost",
      "Total Gratuities",
      "No. Deliveries",
      "Total Wage/Salary Rate Per Delivery",
      "Total Rate Per Delivery",
      "% Wages vs T/O",
    ];
    const csvRows = data.map((r) => [
      r.name,
      r.totalTO,
      r.totalWages,
      r.totalFuel,
      r.totalGratuities,
      r.numDeliveries,
      r.wageRatePerDelivery.toFixed(2),
      r.ratePerDelivery.toFixed(2),
      r.wagesPctTO.toFixed(2) + "%",
    ]);
    triggerDownload(
      generateCSV(headers, csvRows),
      "driver-summary.csv",
      "text/csv"
    );
  }, [data]);

  // Totals
  const totalTO = data.reduce((s, r) => s + r.totalTO, 0);
  const totalWages = data.reduce((s, r) => s + r.totalWages, 0);
  const totalFuel = data.reduce((s, r) => s + r.totalFuel, 0);
  const totalGratuities = data.reduce((s, r) => s + r.totalGratuities, 0);
  const totalDeliveries = data.reduce((s, r) => s + r.numDeliveries, 0);
  const totalWageRate =
    totalDeliveries > 0 ? totalWages / totalDeliveries : 0;
  const totalTORate =
    totalDeliveries > 0 ? totalTO / totalDeliveries : 0;
  const totalWagesPct = totalTO > 0 ? (totalWages / totalTO) * 100 : 0;

  const HEADERS = [
    { label: "Driver Name", align: "left" as const },
    { label: "Total T/O", align: "right" as const },
    { label: "Total Salary/Wages", align: "right" as const },
    { label: "Total Fuel Cost", align: "right" as const },
    { label: "Total Gratuities", align: "right" as const },
    { label: "No. Deliveries", align: "right" as const },
    { label: "Wage Rate/Delivery", align: "right" as const },
    { label: "T/O Rate/Delivery", align: "right" as const },
    { label: "% Wages vs T/O", align: "right" as const },
  ];

  return (
    <ReportWrapper
      title="Drivers Summary"
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
          <Users className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-surface-2">
                {HEADERS.map((h) => (
                  <th
                    key={h.label}
                    className={cn(
                      "px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2",
                      h.align === "left" ? "text-left" : "text-right"
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr
                  key={r.staffId}
                  className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                >
                  <td className="px-3 py-1.5 text-base-900 font-medium">
                    {r.name}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {formatCurrency(r.totalTO)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {formatCurrency(r.totalWages)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {formatCurrency(r.totalFuel)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {formatCurrency(r.totalGratuities)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {r.numDeliveries}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {formatCurrency(r.wageRatePerDelivery)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {formatCurrency(r.ratePerDelivery)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-base-900">
                    {r.wagesPctTO.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-3 py-2 text-base-900">Total</td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {formatCurrency(totalTO)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {formatCurrency(totalWages)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {formatCurrency(totalFuel)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {formatCurrency(totalGratuities)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {totalDeliveries}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {formatCurrency(totalWageRate)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {formatCurrency(totalTORate)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base-900">
                  {totalWagesPct.toFixed(2)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
