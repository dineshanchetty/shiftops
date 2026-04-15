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

// South Africa 2026 public holidays (YYYY-MM-DD)
const SA_PUBLIC_HOLIDAYS_2026 = new Set([
  "2026-01-01", // New Year's Day
  "2026-03-21", // Human Rights Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Family Day
  "2026-04-27", // Freedom Day
  "2026-05-01", // Workers' Day
  "2026-06-16", // Youth Day
  "2026-08-09", // National Women's Day
  "2026-08-10", // Public holiday (Women's Day observed Mon)
  "2026-09-24", // Heritage Day
  "2026-12-16", // Day of Reconciliation
  "2026-12-25", // Christmas Day
  "2026-12-26", // Day of Goodwill
]);

const DEFAULT_HOURLY_RATE = 35; // R35/hr default
const SUNDAY_MULTIPLIER = 2;
const PH_MULTIPLIER = 2;

/** Classify a date string as 'normal', 'sunday', or 'public_holiday' */
function classifyDay(dateStr: string): "normal" | "sunday" | "public_holiday" {
  if (SA_PUBLIC_HOLIDAYS_2026.has(dateStr)) return "public_holiday";
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() === 0) return "sunday";
  return "normal";
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

      if (rosterEntries && rosterEntries.length > 0) {
        // Group by staff with per-day classification
        const byStaff = new Map<
          string,
          {
            staff_id: string;
            first_name: string;
            last_name: string;
            id_number: string;
            position_id: string | null;
            normal_hours: number;
            sunday_hours: number;
            ph_hours: number;
            leave_hours: number;
            overtime_hours: number;
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

          // Check if this is a leave/absent day
          const attendanceArr = re.attendance;
          const isLeave =
            attendanceArr &&
            attendanceArr.length > 0 &&
            attendanceArr.some((a) => a.status === "absent" || a.status === "leave");

          // Prefer attendance actual_hours if confirmed, else roster shift_hours
          const confirmedAttendance =
            attendanceArr && attendanceArr.length > 0
              ? attendanceArr.find((a) => a.status === "confirmed")
              : null;
          const hours = confirmedAttendance?.actual_hours ?? re.shift_hours ?? 0;

          const dayType = classifyDay(re.date);
          const overtime = Math.max(0, hours - 9);
          const regularHours = hours - overtime;

          const existing = byStaff.get(re.staff_id);
          if (existing) {
            existing.daily_hours.push(hours);
            existing.overtime_hours += overtime;
            if (isLeave) {
              existing.leave_hours += regularHours;
            } else if (dayType === "public_holiday") {
              existing.ph_hours += regularHours;
            } else if (dayType === "sunday") {
              existing.sunday_hours += regularHours;
            } else {
              existing.normal_hours += regularHours;
            }
          } else {
            const entry = {
              staff_id: re.staff_id,
              first_name: re.staff.first_name,
              last_name: re.staff.last_name,
              id_number: re.staff.id_number ?? "",
              position_id: re.staff.position_id,
              normal_hours: 0,
              sunday_hours: 0,
              ph_hours: 0,
              leave_hours: 0,
              overtime_hours: overtime,
              daily_hours: [hours],
            };
            if (isLeave) {
              entry.leave_hours = regularHours;
            } else if (dayType === "public_holiday") {
              entry.ph_hours = regularHours;
            } else if (dayType === "sunday") {
              entry.sunday_hours = regularHours;
            } else {
              entry.normal_hours = regularHours;
            }
            byStaff.set(re.staff_id, entry);
          }
        }

        const rows: PayrollRow[] = Array.from(byStaff.values()).map((s) => {
          const position = s.position_id
            ? posMap.get(s.position_id) ?? ""
            : "";

          // Wages: driver wages from cashup if available, else calculate from hours x rate
          const driverWages = driverWagesMap.get(s.staff_id) ?? 0;
          const calculatedWages =
            s.normal_hours * DEFAULT_HOURLY_RATE +
            s.sunday_hours * DEFAULT_HOURLY_RATE * SUNDAY_MULTIPLIER +
            s.ph_hours * DEFAULT_HOURLY_RATE * PH_MULTIPLIER +
            s.leave_hours * DEFAULT_HOURLY_RATE +
            s.overtime_hours * DEFAULT_HOURLY_RATE * 1.5;
          const totalWages = driverWages > 0 ? driverWages : calculatedWages;

          const totalHours =
            s.normal_hours + s.sunday_hours + s.ph_hours + s.leave_hours + s.overtime_hours;

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
            total_hours: Math.round(totalHours * 100) / 100,
            normal_hours: Math.round(s.normal_hours * 100) / 100,
            sunday_hours: Math.round(s.sunday_hours * 100) / 100,
            public_holiday_hours: Math.round(s.ph_hours * 100) / 100,
            overtime_hours: Math.round(s.overtime_hours * 100) / 100,
            total_wages: Math.round(totalWages * 100) / 100,
            earnings_code: "1000",
            earnings_desc: "Normal",
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
      // 1000 = Normal hours
      if (r.normal_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          "1000",
          "Normal",
          r.normal_hours,
          Math.round(r.normal_hours * DEFAULT_HOURLY_RATE * 100) / 100,
        ]);
      }
      // 1001 = Sunday hours
      if (r.sunday_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          "1001",
          "Sunday",
          r.sunday_hours,
          Math.round(r.sunday_hours * DEFAULT_HOURLY_RATE * SUNDAY_MULTIPLIER * 100) / 100,
        ]);
      }
      // 1002 = Public Holiday hours
      if (r.public_holiday_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          "1002",
          "Public Holiday",
          r.public_holiday_hours,
          Math.round(r.public_holiday_hours * DEFAULT_HOURLY_RATE * PH_MULTIPLIER * 100) / 100,
        ]);
      }
      // 3000 = Overtime hours
      if (r.overtime_hours > 0) {
        rows.push([
          r.emp_code,
          r.surname,
          r.first_name,
          r.id_number,
          "3000",
          "Overtime",
          r.overtime_hours,
          Math.round(r.overtime_hours * DEFAULT_HOURLY_RATE * 1.5 * 100) / 100,
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
                    "PH",
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
                          "PH",
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
                      {row.public_holiday_hours.toFixed(1)}
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
                      .reduce((s, r) => s + r.public_holiday_hours, 0)
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
