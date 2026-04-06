"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Truck, Users, DollarSign } from "lucide-react";

interface SplitRow {
  staff_id: string;
  name: string;
  total_turnover: number;
  pct_of_total: number;
  total_deliveries: number;
  avg_per_delivery: number;
  total_wages: number;
  wage_pct: number;
}

const BAR_COLORS = [
  "bg-accent",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
];

export default function DriverSplitsPage() {
  const supabase = createClient();
  const [data, setData] = useState<SplitRow[]>([]);
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

      const { data: entries } = await supabase
        .from("cashup_driver_entries")
        .select("*, staff(first_name, last_name)")
        .in("cashup_id", cashupIds);

      if (entries && entries.length > 0) {
        const byDriver = new Map<
          string,
          {
            staff_id: string;
            name: string;
            turnover: number;
            deliveries: number;
            wages: number;
          }
        >();

        for (const e of entries as (Record<string, unknown> & {
          staff_id: string;
          delivery_count: number | null;
          turnover: number | null;
          wages: number | null;
          staff: { first_name: string; last_name: string } | null;
        })[]) {
          const staffName = e.staff
            ? `${e.staff.first_name} ${e.staff.last_name}`
            : "Unknown";
          const turnover = e.turnover ?? 0;
          const deliveries = e.delivery_count ?? 0;
          const wages = e.wages ?? 0;

          const existing = byDriver.get(e.staff_id);
          if (existing) {
            existing.turnover += turnover;
            existing.deliveries += deliveries;
            existing.wages += wages;
          } else {
            byDriver.set(e.staff_id, {
              staff_id: e.staff_id,
              name: staffName,
              turnover,
              deliveries,
              wages,
            });
          }
        }

        const grandTotal = Array.from(byDriver.values()).reduce(
          (s, r) => s + r.turnover,
          0
        );

        const rows: SplitRow[] = Array.from(byDriver.values())
          .map((r) => ({
            staff_id: r.staff_id,
            name: r.name,
            total_turnover: r.turnover,
            pct_of_total: grandTotal > 0 ? (r.turnover / grandTotal) * 100 : 0,
            total_deliveries: r.deliveries,
            avg_per_delivery:
              r.deliveries > 0 ? r.turnover / r.deliveries : 0,
            total_wages: r.wages,
            wage_pct: r.turnover > 0 ? (r.wages / r.turnover) * 100 : 0,
          }))
          .sort((a, b) => b.total_turnover - a.total_turnover);

        setData(rows);
      } else {
        setData([]);
      }
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Driver Name",
      "Total Turnover",
      "% of Total",
      "Total Deliveries",
      "Avg per Delivery",
      "Total Wages",
      "Wage % of Turnover",
    ];
    const rows = data.map((r) => [
      r.name,
      r.total_turnover.toFixed(2),
      r.pct_of_total.toFixed(1),
      r.total_deliveries,
      r.avg_per_delivery.toFixed(2),
      r.total_wages.toFixed(2),
      r.wage_pct.toFixed(1),
    ]);
    triggerDownload(
      generateCSV(headers, rows),
      "driver-turnover-splits.csv",
      "text/csv"
    );
  }, [data]);

  const totalTurnover = data.reduce((s, r) => s + r.total_turnover, 0);
  const avgPerDriver = data.length > 0 ? totalTurnover / data.length : 0;

  return (
    <ReportWrapper
      title="Driver Turnover Splits"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Delivery Turnover"
          value={formatCurrency(totalTurnover)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Total Drivers"
          value={data.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Avg Turnover per Driver"
          value={formatCurrency(avgPerDriver)}
          icon={<Truck className="h-5 w-5" />}
        />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <Truck className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <>
          {/* Horizontal bar chart */}
          <div className="rounded-lg border border-base-200 bg-surface p-4 mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-base-400 mb-3">
              Turnover Share by Driver
            </h3>
            <div className="space-y-2">
              {data.map((row, i) => (
                <div key={row.staff_id} className="flex items-center gap-3">
                  <span className="text-sm text-base-900 w-32 truncate font-medium">
                    {row.name}
                  </span>
                  <div className="flex-1 h-6 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        BAR_COLORS[i % BAR_COLORS.length]
                      )}
                      style={{ width: `${Math.max(row.pct_of_total, 2)}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono text-base-900 w-14 text-right">
                    {row.pct_of_total.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Data table */}
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2">
                  {[
                    "Driver Name",
                    "Total Turnover",
                    "% of Total",
                    "Total Deliveries",
                    "Avg per Delivery",
                    "Total Wages",
                    "Wage % of Turnover",
                  ].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2",
                        h === "Driver Name" ? "text-left" : "text-right"
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
                    key={row.staff_id}
                    className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 py-2 text-base-900 font-medium">
                      {row.name}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.total_turnover)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.pct_of_total.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.total_deliveries}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.avg_per_delivery)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.total_wages)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.wage_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-4 py-2 text-base-900">Totals</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(totalTurnover)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    100.0%
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {data.reduce((s, r) => s + r.total_deliveries, 0)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(
                      data.reduce((s, r) => s + r.total_deliveries, 0) > 0
                        ? totalTurnover /
                            data.reduce((s, r) => s + r.total_deliveries, 0)
                        : 0
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(
                      data.reduce((s, r) => s + r.total_wages, 0)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {totalTurnover > 0
                      ? (
                          (data.reduce((s, r) => s + r.total_wages, 0) /
                            totalTurnover) *
                          100
                        ).toFixed(1)
                      : "0.0"}
                    %
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </ReportWrapper>
  );
}
