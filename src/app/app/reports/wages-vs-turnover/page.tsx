"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { TrendingUp, DollarSign, Receipt, CalendarDays } from "lucide-react";

const LABOUR_TARGET = 25;
// Fallback only — real rates come from staff_rates (Rate History / Bulk Rate
// Update), resolved per staff per day. Matches the payroll export default.
const DEFAULT_HOURLY_RATE = 30.81;
// Wage multipliers — keep in lock-step with the Sage Pastel payroll export.
const SUNDAY_MULTIPLIER = 1.5;
const PH_MULTIPLIER = 2;
const OT_MULTIPLIER = 1.5;
const OT_THRESHOLD_HOURS = 9;

// South Africa 2026 public holidays (same list as payroll-export)
const SA_PUBLIC_HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-03-21", "2026-04-03", "2026-04-06", "2026-04-27",
  "2026-05-01", "2026-06-16", "2026-08-09", "2026-08-10", "2026-09-24",
  "2026-12-16", "2026-12-25", "2026-12-26",
]);

function classifyDay(dateStr: string): "normal" | "sunday" | "public_holiday" {
  if (SA_PUBLIC_HOLIDAYS_2026.has(dateStr)) return "public_holiday";
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() === 0) return "sunday";
  return "normal";
}

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

      // Fetch cashups with driver wages (staff_id needed so rostered drivers
      // aren't double-counted — their pay comes from the cashup driver entry).
      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("*, cashup_driver_entries(staff_id, wages)")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      // Fetch roster entries — include is_off=true so paid_leave / sick get
      // counted as wages. Unpaid 'off' is filtered out in the loop below.
      // Attendance is embedded so confirmed actual hours override scheduled,
      // matching the payroll export.
      const [{ data: rosterEntries }, { data: rateRows }] = await Promise.all([
        supabase
          .from("roster_entries")
          .select("date, staff_id, shift_hours, is_off, leave_type, attendance(actual_hours, status)")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo),
        supabase
          .from("staff_rates")
          .select("staff_id, hourly_rate, effective_from, effective_to"),
      ]);

      // Per-staff effective-dated rate lookup (falls back to the default).
      const ratesByStaff = new Map<
        string,
        { rate: number; from: string; to: string | null }[]
      >();
      for (const r of rateRows ?? []) {
        const arr = ratesByStaff.get(r.staff_id) ?? [];
        arr.push({ rate: Number(r.hourly_rate), from: r.effective_from, to: r.effective_to });
        ratesByStaff.set(r.staff_id, arr);
      }
      const rateFor = (staffId: string, date: string): number => {
        const arr = ratesByStaff.get(staffId);
        if (arr) {
          for (const r of arr) {
            if (r.from <= date && (r.to === null || r.to >= date)) return r.rate;
          }
        }
        return DEFAULT_HOURLY_RATE;
      };

      // Pass 1 — cashups: sum turnover + driver wages per date, and record
      // which staff earned driver wages on which date so their rostered hours
      // are excluded below (driver wages REPLACE roster wages, same rule as
      // the payroll export — previously they were both counted).
      const turnoverByDate = new Map<string, number>();
      const driverWagesByDate = new Map<string, number>();
      const driverStaffDates = new Set<string>(); // `${date}|${staff_id}`
      for (const c of (cashups ?? []) as (Record<string, unknown> & {
        date: string;
        gross_turnover: number | null;
        cashup_driver_entries: { staff_id: string | null; wages: number | null }[];
      })[]) {
        turnoverByDate.set(c.date, (turnoverByDate.get(c.date) ?? 0) + (c.gross_turnover ?? 0));
        for (const d of c.cashup_driver_entries ?? []) {
          driverWagesByDate.set(c.date, (driverWagesByDate.get(c.date) ?? 0) + (d.wages ?? 0));
          if (d.staff_id) driverStaffDates.add(`${c.date}|${d.staff_id}`);
        }
      }

      // Pass 2 — roster wages per date, matching payroll-export logic:
      // confirmed attendance hours override scheduled, Sunday/PH/OT
      // multipliers apply, paid leave pays plain rate with no OT.
      const rosterWagesByDate = new Map<string, number>();
      for (const re of (rosterEntries ?? []) as {
        date: string;
        staff_id: string;
        shift_hours: number | null;
        is_off: boolean;
        leave_type: string | null;
        attendance: { actual_hours: number | null; status: string | null }[] | null;
      }[]) {
        if (re.is_off && re.leave_type !== "paid_leave" && re.leave_type !== "sick") continue;
        // Driver paid via the cashup for this date — skip roster hours.
        if (driverStaffDates.has(`${re.date}|${re.staff_id}`)) continue;

        const att = re.attendance ?? [];
        const isLeave =
          re.leave_type === "paid_leave" ||
          re.leave_type === "sick" ||
          att.some((a) => a.status === "absent" || a.status === "leave");
        const confirmed = att.find((a) => a.status === "confirmed");
        const hours = confirmed?.actual_hours ?? re.shift_hours ?? 0;
        const rate = rateFor(re.staff_id, re.date);

        let amount: number;
        if (isLeave) {
          amount = hours * rate;
        } else {
          const ot = Math.max(0, hours - OT_THRESHOLD_HOURS);
          const reg = hours - ot;
          const dayType = classifyDay(re.date);
          const mult =
            dayType === "public_holiday" ? PH_MULTIPLIER : dayType === "sunday" ? SUNDAY_MULTIPLIER : 1;
          amount = reg * rate * mult + ot * rate * OT_MULTIPLIER;
        }
        rosterWagesByDate.set(re.date, (rosterWagesByDate.get(re.date) ?? 0) + amount);
      }

      // Combine — roster wages counted exactly ONCE per date (previously they
      // were re-added for every branch's cashup row on that date, inflating
      // wages up to Nx on multi-branch selections).
      const rows: WagesRow[] = Array.from(turnoverByDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, turnover]) => {
          const totalWages =
            (driverWagesByDate.get(date) ?? 0) + (rosterWagesByDate.get(date) ?? 0);
          const pct = turnover > 0 ? (totalWages / turnover) * 100 : 0;
          return {
            date,
            turnover,
            total_wages: totalWages,
            labour_pct: pct,
            target_pct: LABOUR_TARGET,
            over_under: pct - LABOUR_TARGET,
          };
        });
      setData(rows);
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
