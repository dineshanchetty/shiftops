"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { ClipboardList, Users, Clock, CalendarDays } from "lucide-react";

interface RosterRow {
  staffId: string;
  name: string;
  position: string;
  scheduledHours: number;
  targetHours: number;
  overUnder: number;
}

export default function BudgetRosterPage() {
  const supabase = createClient();
  const [data, setData] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetHoursPerWeek, setTargetHoursPerWeek] = useState(40);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const [{ data: entries }, { data: staffList }, { data: positions }] = await Promise.all([
        supabase
          .from("roster_entries")
          .select("*")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo)
          .eq("is_off", false),
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

      // Calculate number of weeks in the date range
      const from = new Date(f.dateFrom);
      const to = new Date(f.dateTo);
      const days = Math.max(1, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24) + 1);
      const weeks = Math.max(1, days / 7);
      const targetForPeriod = targetHoursPerWeek * weeks;

      // Aggregate per staff
      const hourMap = new Map<string, number>();
      for (const e of entries) {
        hourMap.set(e.staff_id, (hourMap.get(e.staff_id) ?? 0) + (e.shift_hours ?? 0));
      }

      const rows: RosterRow[] = Array.from(hourMap.entries()).map(([staffId, scheduled]) => {
        const info = staffMap.get(staffId);
        return {
          staffId,
          name: info?.name ?? "Unknown",
          position: posMap.get(info?.positionId ?? "") ?? "N/A",
          scheduledHours: scheduled,
          targetHours: targetForPeriod,
          overUnder: scheduled - targetForPeriod,
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setData(rows);
      setLoading(false);
    },
    [supabase, targetHoursPerWeek]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Staff Name", "Position", "Scheduled Hours", "Target Hours", "Over/Under"];
    const rows = data.map((r) => [r.name, r.position, r.scheduledHours.toFixed(1), r.targetHours.toFixed(1), r.overUnder.toFixed(1)]);
    triggerDownload(generateCSV(headers, rows), "budget-roster-report.csv", "text/csv");
  }, [data]);

  const totalScheduled = data.reduce((s, r) => s + r.scheduledHours, 0);
  const totalStaff = data.length;
  const avgHoursPerStaff = totalStaff > 0 ? totalScheduled / totalStaff : 0;

  return (
    <ReportWrapper title="Budget Roster Report" onRun={handleRun} onExportCSV={handleExportCSV}>
      {/* Target input */}
      <div className="flex items-end gap-3 mb-6 print:hidden">
        <div>
          <label className="text-sm font-medium text-base-700 block mb-1.5">Target Hours/Week per Staff</label>
          <input
            type="number"
            value={targetHoursPerWeek}
            onChange={(e) => setTargetHoursPerWeek(Number(e.target.value) || 0)}
            className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-32"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Scheduled Hours" value={totalScheduled.toFixed(1)} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Total Staff" value={totalStaff} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Avg Hours/Staff" value={avgHoursPerStaff.toFixed(1)} icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard label="Target/Week" value={`${targetHoursPerWeek}h`} icon={<ClipboardList className="h-5 w-5" />} />
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
          <ClipboardList className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Staff Name", "Position", "Scheduled Hours", "Target Hours", "Over/Under"].map((h) => (
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
                  <td className="px-4 py-2 text-right font-mono text-base-900">{row.targetHours.toFixed(1)}</td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", row.overUnder < 0 ? "text-red-600" : row.overUnder > 0 ? "text-green-600" : "text-base-900")}>
                    {row.overUnder > 0 ? "+" : ""}{row.overUnder.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900" colSpan={2}>Totals ({totalStaff} staff)</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{totalScheduled.toFixed(1)}</td>
                <td className="px-4 py-2 text-right font-mono text-base-900">{data.reduce((s, r) => s + r.targetHours, 0).toFixed(1)}</td>
                <td className={cn("px-4 py-2 text-right font-mono font-semibold", data.reduce((s, r) => s + r.overUnder, 0) < 0 ? "text-red-600" : "text-green-600")}>
                  {data.reduce((s, r) => s + r.overUnder, 0).toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
