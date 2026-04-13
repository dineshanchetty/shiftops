"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { Clock, Users, Target, AlertTriangle } from "lucide-react";

interface WagesHoursRow {
  staffId: string;
  name: string;
  position: string;
  scheduledHours: number;
  actualHours: number;
  budgetHours: number;
  variance: number;
}

export default function WagesHoursBudgetPage() {
  const supabase = createClient();
  const [data, setData] = useState<WagesHoursRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [budgetHoursPerWeek, setBudgetHoursPerWeek] = useState(40);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const [{ data: entries }, { data: attendanceRecords }, { data: staffList }, { data: positions }] = await Promise.all([
        supabase
          .from("roster_entries")
          .select("*")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo)
          .eq("is_off", false),
        supabase
          .from("attendance")
          .select("roster_entry_id, actual_hours"),
        supabase.from("staff").select("id, first_name, last_name, position_id"),
        supabase.from("positions").select("id, name"),
      ]);

      if (!entries || entries.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const staffMap = new Map((staffList ?? []).map((s) => [s.id, { name: `${s.first_name} ${s.last_name}`, positionId: s.position_id }]));
      const posMap = new Map((positions ?? []).map((p) => [p.id, p.name]));
      const attendanceMap = new Map((attendanceRecords ?? []).map((a) => [a.roster_entry_id, a.actual_hours ?? 0]));

      // Calculate weeks
      const from = new Date(f.dateFrom);
      const to = new Date(f.dateTo);
      const days = Math.max(1, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24) + 1);
      const weeks = Math.max(1, days / 7);
      const budgetForPeriod = budgetHoursPerWeek * weeks;

      // Aggregate per staff
      const staffAgg = new Map<string, { scheduled: number; actual: number }>();
      for (const e of entries) {
        const existing = staffAgg.get(e.staff_id) ?? { scheduled: 0, actual: 0 };
        const scheduledHrs = e.shift_hours ?? 0;
        const actualHrs = attendanceMap.get(e.id) ?? scheduledHrs; // fall back to scheduled if no attendance
        existing.scheduled += scheduledHrs;
        existing.actual += actualHrs;
        staffAgg.set(e.staff_id, existing);
      }

      const rows: WagesHoursRow[] = Array.from(staffAgg.entries()).map(([staffId, agg]) => {
        const info = staffMap.get(staffId);
        return {
          staffId,
          name: info?.name ?? "Unknown",
          position: posMap.get(info?.positionId ?? "") ?? "N/A",
          scheduledHours: agg.scheduled,
          actualHours: agg.actual,
          budgetHours: budgetForPeriod,
          variance: agg.actual - budgetForPeriod,
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setData(rows);
      setLoading(false);
    },
    [supabase, budgetHoursPerWeek]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Staff Name", "Position", "Scheduled Hours", "Actual Hours", "Budget Hours", "Variance"];
    const rows = data.map((r) => [r.name, r.position, r.scheduledHours.toFixed(1), r.actualHours.toFixed(1), r.budgetHours.toFixed(1), r.variance.toFixed(1)]);
    triggerDownload(generateCSV(headers, rows), "wages-hours-budget.csv", "text/csv");
  }, [data]);

  const totalScheduled = data.reduce((s, r) => s + r.scheduledHours, 0);
  const totalActual = data.reduce((s, r) => s + r.actualHours, 0);
  const totalBudget = data.reduce((s, r) => s + r.budgetHours, 0);
  const totalVariance = totalActual - totalBudget;

  return (
    <ReportWrapper title="Wages Hours Actual vs Budget" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Budget input */}
      <div className="flex items-end gap-3 mb-6 print:hidden">
        <div>
          <label className="text-sm font-medium text-base-700 block mb-1.5">Budget Hours/Week per Staff</label>
          <input
            type="number"
            value={budgetHoursPerWeek}
            onChange={(e) => setBudgetHoursPerWeek(Number(e.target.value) || 0)}
            className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-32"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Scheduled" value={totalScheduled.toFixed(1)} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Total Actual" value={totalActual.toFixed(1)} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Total Budget" value={totalBudget.toFixed(1)} icon={<Target className="h-5 w-5" />} />
        <StatCard label="Variance" value={totalVariance.toFixed(1)} icon={<AlertTriangle className="h-5 w-5" />} />
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
          <Clock className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Staff Name", "Position", "Scheduled Hours", "Actual Hours", "Budget Hours", "Variance"].map((h) => (
                  <th key={h} className={cn("px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2", h === "Staff Name" || h === "Position" ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.staffId} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-base-900">{row.position}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.scheduledHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.actualHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.budgetHours.toFixed(1)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.variance < 0 ? "text-green-600" : row.variance > 0 ? "text-red-600" : "text-base-900")}>
                    {row.variance > 0 ? "+" : ""}{row.variance.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900" colSpan={2}>Totals</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{totalScheduled.toFixed(1)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{totalActual.toFixed(1)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{totalBudget.toFixed(1)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", totalVariance < 0 ? "text-green-600" : totalVariance > 0 ? "text-red-600" : "text-base-900")}>
                  {totalVariance > 0 ? "+" : ""}{totalVariance.toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
