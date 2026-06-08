"use client";

import { useState, useCallback, useMemo, useEffect, useTransition } from "react";
import { CheckCheck, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  loadAttendance,
  saveAttendance,
  type RosteredStaffEntry,
} from "@/app/app/cashup/actions";

// ─── Types ──────────────────────────────────────────────────────────────────

type AttendanceStatus = "pending" | "confirmed" | "absent" | "late";

interface AttendanceRow {
  staff_id: string;
  roster_entry_id: string;
  first_name: string;
  last_name: string;
  position_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  actual_hours: number | null;
  status: AttendanceStatus;
  /** 'paid_leave' / 'sick' / 'off' / null. Paid leave + sick are pre-filled
   *  with the rostered shift_hours and are not time-editable. */
  leave_type: string | null;
}

interface AttendanceTableProps {
  rosteredStaff: RosteredStaffEntry[];
  date: string;
  branchId: string;
  readOnly?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcHours(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  const diff = endMin - startMin;
  if (diff <= 0) return null;
  return Math.round((diff / 60) * 100) / 100;
}

function formatTimeShort(time: string | null): string {
  if (!time) return "--:--";
  return time.substring(0, 5);
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; variant: "default" | "success" | "danger" | "warning"; rowClass: string }
> = {
  pending: { label: "Pending", variant: "default", rowClass: "" },
  confirmed: { label: "Confirmed", variant: "success", rowClass: "bg-green-50/50" },
  absent: { label: "Absent", variant: "danger", rowClass: "bg-red-50/50" },
  late: { label: "Late", variant: "warning", rowClass: "bg-amber-50/50" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function AttendanceTable({
  rosteredStaff,
  date: _date,
  branchId: _branchId,
  readOnly = false,
}: AttendanceTableProps) {
  void _date;
  void _branchId;

  // Build a fresh row from a roster entry, applying any existing attendance.
  const buildRow = useCallback(
    (
      s: RosteredStaffEntry,
      existing?: {
        actual_start: string | null;
        actual_end: string | null;
        actual_hours: number | null;
        status: AttendanceStatus;
      }
    ): AttendanceRow => {
      const isPaidLeave = s.leave_type === "paid_leave" || s.leave_type === "sick";
      if (existing) {
        return {
          staff_id: s.staff_id,
          roster_entry_id: s.roster_entry_id,
          first_name: s.first_name,
          last_name: s.last_name,
          position_name: s.position_name,
          scheduled_start: s.shift_start,
          scheduled_end: s.shift_end,
          actual_start: existing.actual_start,
          actual_end: existing.actual_end,
          actual_hours: existing.actual_hours,
          status: existing.status,
          leave_type: s.leave_type,
        };
      }
      return {
        staff_id: s.staff_id,
        roster_entry_id: s.roster_entry_id,
        first_name: s.first_name,
        last_name: s.last_name,
        position_name: s.position_name,
        scheduled_start: s.shift_start,
        scheduled_end: s.shift_end,
        actual_start: s.shift_start,
        actual_end: s.shift_end,
        actual_hours: isPaidLeave
          ? s.shift_hours ?? null
          : calcHours(s.shift_start, s.shift_end),
        status: isPaidLeave ? "confirmed" : "pending",
        leave_type: s.leave_type,
      };
    },
    []
  );

  // Initial render uses defaults; the effect below replaces with DB state.
  const [rows, setRows] = useState<AttendanceRow[]>(() =>
    rosteredStaff.map((s) => buildRow(s))
  );

  // Load any saved attendance for these roster entries and overlay it.
  // Runs whenever the roster set changes (e.g. user navigates to a different
  // day or branch). Without this, navigating away and back wiped the
  // confirmed/late/absent state because nothing was ever read from the DB.
  useEffect(() => {
    let cancelled = false;
    const ids = rosteredStaff.map((s) => s.roster_entry_id).filter(Boolean);
    if (ids.length === 0) return;
    loadAttendance(ids).then((map) => {
      if (cancelled) return;
      setRows(rosteredStaff.map((s) => buildRow(s, map[s.roster_entry_id])));
    });
    return () => {
      cancelled = true;
    };
  }, [rosteredStaff, buildRow]);

  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Match by roster_entry_id (not staff_id) so split-shift rows for the same
  // person stay independently editable.
  const updateRow = useCallback(
    (rosterEntryId: string, updates: Partial<AttendanceRow>) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.roster_entry_id !== rosterEntryId) return r;
          const updated = { ...r, ...updates };
          if ("actual_start" in updates || "actual_end" in updates) {
            updated.actual_hours = calcHours(updated.actual_start, updated.actual_end);
          }
          return updated;
        })
      );
    },
    []
  );

  const handleConfirmAll = useCallback(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.status !== "pending") return r;
        return {
          ...r,
          actual_start: r.actual_start ?? r.scheduled_start,
          actual_end: r.actual_end ?? r.scheduled_end,
          actual_hours: calcHours(
            r.actual_start ?? r.scheduled_start,
            r.actual_end ?? r.scheduled_end
          ),
          status: "confirmed" as AttendanceStatus,
        };
      })
    );
  }, []);

  const handleSave = useCallback(() => {
    setSaveError(null);
    startSaving(async () => {
      const res = await saveAttendance(
        rows.map((r) => ({
          roster_entry_id: r.roster_entry_id,
          actual_start: r.actual_start,
          actual_end: r.actual_end,
          actual_hours: r.actual_hours,
          status: r.status,
        }))
      );
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(res.error);
      }
    });
  }, [rows]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending").length,
    [rows]
  );

  const totalActualHours = useMemo(
    () =>
      rows
        .filter((r) => r.status !== "absent")
        .reduce((sum, r) => sum + (r.actual_hours ?? 0), 0),
    [rows]
  );

  if (rosteredStaff.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-base-400">No staff rostered for this date</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      {!readOnly && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleConfirmAll}
              disabled={pendingCount === 0}
            >
              <CheckCheck size={14} />
              Confirm All ({pendingCount})
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-base-500">
              Total: {totalActualHours.toFixed(1)}h
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving..." : saved ? "Saved!" : "Save Attendance"}
            </Button>
          </div>
        </div>
      )}
      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {saveError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-base-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <th className="text-left px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide">
                Staff
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide hidden sm:table-cell">
                Position
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide">
                Scheduled
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide">
                Actual Start
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide">
                Actual End
              </th>
              <th className="text-center px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide">
                Hours
              </th>
              <th className="text-center px-3 py-2 text-xs font-medium text-base-500 uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const config = STATUS_CONFIG[row.status];
              const isPaidLeave =
                row.leave_type === "paid_leave" || row.leave_type === "sick";
              const leaveLabel =
                row.leave_type === "sick" ? "SICK LEAVE" : "PAID LEAVE";
              // Is this the 2nd (or later) shift for the same staff member
              // today? If so we show a "Shift 2" tag and indent the name.
              const splitIndex = rows
                .slice(0, idx)
                .filter((r) => r.staff_id === row.staff_id).length;
              const isSplitContinuation = splitIndex > 0;
              return (
                <tr
                  key={row.roster_entry_id}
                  className={cn(
                    "border-b border-base-100 last:border-b-0 h-[36px]",
                    isPaidLeave ? "bg-blue-50/40" : config.rowClass,
                    isSplitContinuation && "bg-amber-50/30"
                  )}
                >
                  {/* Staff name */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium text-base-800",
                          row.status === "absent" && "line-through text-base-400",
                          isSplitContinuation && "pl-3 text-base-500"
                        )}
                      >
                        {isSplitContinuation
                          ? `↳ ${row.first_name} ${row.last_name}`
                          : `${row.first_name} ${row.last_name}`}
                      </span>
                      {isSplitContinuation && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                          SHIFT {splitIndex + 1}
                        </span>
                      )}
                      {isPaidLeave && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
                          {leaveLabel}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Position */}
                  <td className="px-3 py-1.5 hidden sm:table-cell">
                    <span className="text-xs text-base-500">
                      {row.position_name ?? "—"}
                    </span>
                  </td>

                  {/* Scheduled times */}
                  <td className="px-3 py-1.5">
                    <span className="text-xs font-mono text-base-500">
                      {isPaidLeave
                        ? "—"
                        : `${formatTimeShort(row.scheduled_start)}–${formatTimeShort(row.scheduled_end)}`}
                    </span>
                  </td>

                  {/* Actual Start */}
                  <td className="px-3 py-1.5">
                    {isPaidLeave ? (
                      <span className="text-xs font-mono text-base-400">—</span>
                    ) : (
                      <input
                        type="time"
                        value={row.actual_start ?? ""}
                        onChange={(e) =>
                          updateRow(row.roster_entry_id, {
                            actual_start: e.target.value || null,
                          })
                        }
                        disabled={readOnly || row.status === "absent"}
                        className="h-[30px] w-[90px] rounded border border-base-200 bg-surface px-1.5 text-xs font-mono text-base-700 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    )}
                  </td>

                  {/* Actual End */}
                  <td className="px-3 py-1.5">
                    {isPaidLeave ? (
                      <span className="text-xs font-mono text-base-400">—</span>
                    ) : (
                      <input
                        type="time"
                        value={row.actual_end ?? ""}
                        onChange={(e) =>
                          updateRow(row.roster_entry_id, {
                            actual_end: e.target.value || null,
                          })
                        }
                        disabled={readOnly || row.status === "absent"}
                        className="h-[30px] w-[90px] rounded border border-base-200 bg-surface px-1.5 text-xs font-mono text-base-700 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    )}
                  </td>

                  {/* Actual Hours */}
                  <td className="px-3 py-1.5 text-center">
                    <span className="text-xs font-mono text-base-600">
                      {row.actual_hours != null
                        ? `${row.actual_hours.toFixed(1)}h`
                        : "—"}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-1.5 text-center">
                    {readOnly ? (
                      <Badge variant={config.variant}>{config.label}</Badge>
                    ) : (
                      <select
                        value={row.status}
                        onChange={(e) =>
                          updateRow(row.roster_entry_id, {
                            status: e.target.value as AttendanceStatus,
                          })
                        }
                        className={cn(
                          "h-[28px] rounded-full px-2 text-[11px] font-semibold border-0 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer appearance-none text-center",
                          row.status === "pending" && "bg-base-200 text-base-700",
                          row.status === "confirmed" && "bg-green-100 text-green-700",
                          row.status === "absent" && "bg-red-100 text-red-700",
                          row.status === "late" && "bg-amber-100 text-amber-700"
                        )}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
