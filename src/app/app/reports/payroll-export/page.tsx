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
import { Users, Clock, DollarSign, FileSpreadsheet } from "lucide-react";

interface PayrollRow {
  staff_id: string;
  emp_code: string;
  surname: string;
  first_name: string;
  id_number: string;
  position: string;
  total_hours: number;
  normal_hours: number;
  sunday_hours: number;
  public_holiday_hours: number;
  overtime_hours: number;
  total_wages: number;
  earnings_code: string;
  earnings_desc: string;
}

/** Count Sundays between two date strings (inclusive). */
function countSundays(from: string, to: string): number {
  let count = 0;
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    if (d.getDay() === 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function PayrollExportPage() {
  const supabase = createClient();
  const [data, setData] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReportFilters | null>(null);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);
      setFilters(f);

      // Fetch roster entries for the period
      const { data: rosterEntries } = await supabase
        .from("roster_entries")
        .select(
          "*, staff(id, first_name, last_name, id_number, position_id), attendance(actual_hours, status)"
        )
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .eq("is_off", false);

      // Fetch driver wage entries for the period
      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id, date")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo);

      const driverWagesMap = new Map<string, number>();
      if (cashups && cashups.length > 0) {
        const cashupIds = cashups.map((c) => c.id);
        const { data: driverEntries } = await supabase
          .from("cashup_driver_entries")
          .select("staff_id, wages")
          .in("cashup_id", cashupIds);

        if (driverEntries) {
          for (const de of driverEntries) {
            const existing = driverWagesMap.get(de.staff_id) ?? 0;
            driverWagesMap.set(de.staff_id, existing + (de.wages ?? 0));
          }
        }
      }

      // Fetch positions for lookup
      const { data: positions } = await supabase
        .from("positions")
        .select("id, name");
      const posMap = new Map(
        (positions ?? []).map((p) => [p.id, p.name])
      );

      const sundaysInPeriod = countSundays(f.dateFrom, f.dateTo);

      if (rosterEntries && rosterEntries.length > 0) {
        // Group by staff
        const byStaff = new Map<
          string,
          {
            staff_id: string;
            first_name: string;
            last_name: string;
            id_number: string;
            position_id: string | null;
            total_hours: number;
            daily_hours: number[];
          }
        >();

        for (const re of rosterEntries as (Record<string, unknown> & {
          staff_id: string;
          date: string;
          shift_hours: number | null;
          staff: {
            id: string;
            first_name: string;
            last_name: string;
            id_number: string | null;
            position_id: string | null;
          } | null;
          attendance:
            | { actual_hours: number | null; status: string | null }[]
            | null;
        })[]) {
          if (!re.staff) continue;

          // Prefer attendance actual_hours if confirmed, else roster shift_hours
          const attendanceArr = re.attendance;
          const confirmedAttendance =
            attendanceArr && attendanceArr.length > 0
              ? attendanceArr.find((a) => a.status === "confirmed")
              : null;
          const hours = confirmedAttendance?.actual_hours ?? re.shift_hours ?? 0;

          const existing = byStaff.get(re.staff_id);
          if (existing) {
            existing.total_hours += hours;
            existing.daily_hours.push(hours);
          } else {
            byStaff.set(re.staff_id, {
              staff_id: re.staff_id,
              first_name: re.staff.first_name,
              last_name: re.staff.last_name,
              id_number: re.staff.id_number ?? "",
              position_id: re.staff.position_id,
              total_hours: hours,
              daily_hours: [hours],
            });
          }
        }

        const rows: PayrollRow[] = Array.from(byStaff.values()).map((s) => {
          // Overtime: hours > 9 per day
          const overtimeHours = s.daily_hours.reduce(
            (sum, h) => sum + Math.max(0, h - 9),
            0
          );
          const normalHoursRaw = s.total_hours - overtimeHours;

          // Sunday hours estimate: proportional allocation
          const totalDays = s.daily_hours.length;
          const avgHoursPerDay = totalDays > 0 ? s.total_hours / totalDays : 0;
          const sundayHours = sundaysInPeriod * avgHoursPerDay;

          const normalHours = Math.max(0, normalHoursRaw - sundayHours);

          // Wages: driver wages from cashup if available, else 0
          const driverWages = driverWagesMap.get(s.staff_id) ?? 0;
          const totalWages = driverWages;

          const position = s.position_id
            ? posMap.get(s.position_id) ?? ""
            : "";

          // Earnings code: drivers get 1000 (Hourly), salary staff get 5000
          const isDriver = position.toLowerCase().includes("driver");
          const earningsCode = isDriver ? "1000" : "5000";
          const earningsDesc = isDriver ? "Hourly" : "Basic Salary";

          // Short employee code: first 3 chars of last name + first 2 of first
          const empCode = (
            s.last_name.slice(0, 3) + s.first_name.slice(0, 2)
          ).toUpperCase();

          return {
            staff_id: s.staff_id,
            emp_code: empCode,
            surname: s.last_name,
            first_name: s.first_name,
            id_number: s.id_number,
            position,
            total_hours: Math.round(s.total_hours * 100) / 100,
            normal_hours: Math.round(normalHours * 100) / 100,
            sunday_hours: Math.round(sundayHours * 100) / 100,
            public_holiday_hours: 0,
            overtime_hours: Math.round(overtimeHours * 100) / 100,
            total_wages: totalWages,
            earnings_code: earningsCode,
            earnings_desc: earningsDesc,
          };
        });

        rows.sort((a, b) => a.surname.localeCompare(b.surname));
        setData(rows);
      } else {
        setData([]);
      }
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    // Sage Pastel compatible format
    const headers = [
      "EmpCode",
      "Surname",
      "FirstName",
      "IDNumber",
      "EarningsCode",
      "Description",
      "Hours",
      "Amount",
    ];
    const rows: (string | number)[][] = [];

    for (const r of data) {
      // Normal hours row
      if (r.normal_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          r.earnings_code,
          r.earnings_desc,
          r.normal_hours,
          r.total_wages,
        ]);
      }
      // Overtime row
      if (r.overtime_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          "3000",
          "Overtime",
          r.overtime_hours,
          0,
        ]);
      }
      // Sunday row
      if (r.sunday_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          "4000",
          "Sunday",
          r.sunday_hours,
          0,
        ]);
      }
    }

    const filename = filters
      ? `payroll-export-${filters.dateFrom}-to-${filters.dateTo}.csv`
      : "payroll-export.csv";

    triggerDownload(generateCSV(headers, rows), filename, "text/csv");
  }, [data, filters]);

  const totalStaff = data.length;
  const totalHours = data.reduce((s, r) => s + r.total_hours, 0);
  const totalWages = data.reduce((s, r) => s + r.total_wages, 0);

  return (
    <ReportWrapper
      title="Sage Pastel Payroll Export"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Staff"
          value={totalStaff}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Total Hours"
          value={totalHours.toFixed(1)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Total Wages"
          value={formatCurrency(totalWages)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Avg Hours/Staff"
          value={totalStaff > 0 ? (totalHours / totalStaff).toFixed(1) : "0"}
          icon={<FileSpreadsheet className="h-5 w-5" />}
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
          <FileSpreadsheet className="h-12 w-12 mb-3" />
          <p className="text-sm">No roster data for selected period</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <>
          {/* Pastel export info */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-4 text-sm text-blue-800">
            Preview below. Click <strong>CSV</strong> to export in Sage Pastel
            Payroll import format.
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2">
                  {[
                    "Emp Code",
                    "Surname",
                    "First Name",
                    "ID Number",
                    "Position",
                    "Total Hours",
                    "Normal",
                    "Sunday",
                    "Overtime",
                    "Gross Wages",
                    "Earnings Code",
                  ].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2 whitespace-nowrap",
                        [
                          "Emp Code",
                          "Surname",
                          "First Name",
                          "ID Number",
                          "Position",
                          "Earnings Code",
                        ].includes(h)
                          ? "text-left"
                          : "text-right"
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
                    <td className="px-4 py-2 text-base-900 font-mono text-sm">
                      {row.emp_code}
                    </td>
                    <td className="px-4 py-2 text-base-900 font-medium">
                      {row.surname}
                    </td>
                    <td className="px-4 py-2 text-base-900">
                      {row.first_name}
                    </td>
                    <td className="px-4 py-2 text-base-500 font-mono text-xs">
                      {row.id_number || "-"}
                    </td>
                    <td className="px-4 py-2 text-base-500 text-xs">
                      {row.position || "-"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.total_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.normal_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.sunday_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {row.overtime_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-base-900">
                      {formatCurrency(row.total_wages)}
                    </td>
                    <td className="px-4 py-2 text-base-500 font-mono text-xs">
                      {row.earnings_code} ({row.earnings_desc})
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-4 py-2 text-base-900" colSpan={5}>
                    Totals ({data.length} staff)
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {totalHours.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {data
                      .reduce((s, r) => s + r.normal_hours, 0)
                      .toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {data
                      .reduce((s, r) => s + r.sunday_hours, 0)
                      .toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {data
                      .reduce((s, r) => s + r.overtime_hours, 0)
                      .toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base-900">
                    {formatCurrency(totalWages)}
                  </td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </ReportWrapper>
  );
}
