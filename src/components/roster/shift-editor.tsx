"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RosterEntry, Staff } from "@/lib/types";
import { format, parseISO } from "date-fns";

type EntryWithStaff = RosterEntry & {
  staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null };
};

interface ShiftRow {
  id?: string;
  staffId: string;
  shiftStart: string;
  shiftEnd: string;
  shiftHours: number;
  isOff: boolean;
  toDelete?: boolean;
}

interface ShiftEditorProps {
  date: string;
  branchId: string;
  tenantId: string;
  entries: EntryWithStaff[];
  staff: Staff[];
  onSave: (
    entries: {
      id?: string;
      staffId: string;
      date: string;
      shiftStart?: string;
      shiftEnd?: string;
      shiftHours?: number;
      isOff: boolean;
      branchId: string;
      tenantId: string;
    }[],
    deleteIds: string[]
  ) => Promise<void>;
  onClose: () => void;
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (diff < 0) diff += 24; // overnight shift
  return Math.round(diff * 100) / 100;
}

export function ShiftEditor({
  date,
  branchId,
  tenantId,
  entries,
  staff,
  onSave,
  onClose,
}: ShiftEditorProps) {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entries.length > 0) {
      setRows(
        entries.map((e) => ({
          id: e.id,
          staffId: e.staff_id,
          shiftStart: e.shift_start ? e.shift_start.slice(0, 5) : "",
          shiftEnd: e.shift_end ? e.shift_end.slice(0, 5) : "",
          shiftHours: e.shift_hours ?? 0,
          isOff: e.is_off ?? false,
        }))
      );
    } else {
      setRows([
        {
          staffId: "",
          shiftStart: "",
          shiftEnd: "",
          shiftHours: 0,
          isOff: false,
        },
      ]);
    }
  }, [entries]);

  const handleRowChange = useCallback(
    (index: number, partial: Partial<ShiftRow>) => {
      setRows((prev) => {
        const next = [...prev];
        const row = { ...next[index], ...partial };

        // Auto-calculate hours when times change
        if (
          ("shiftStart" in partial || "shiftEnd" in partial) &&
          !row.isOff
        ) {
          row.shiftHours = calcHours(row.shiftStart, row.shiftEnd);
        }

        // Clear times when day off is toggled
        if ("isOff" in partial && partial.isOff) {
          row.shiftStart = "";
          row.shiftEnd = "";
          row.shiftHours = 0;
        }

        next[index] = row;
        return next;
      });
    },
    []
  );

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        staffId: "",
        shiftStart: "",
        shiftEnd: "",
        shiftHours: 0,
        isOff: false,
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const row = prev[index];
      if (row.id) {
        // Mark for deletion
        const next = [...prev];
        next[index] = { ...row, toDelete: true };
        return next;
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const toSave = rows
        .filter((r) => !r.toDelete && r.staffId)
        .map((r) => ({
          id: r.id,
          staffId: r.staffId,
          date,
          shiftStart: r.isOff ? undefined : r.shiftStart || undefined,
          shiftEnd: r.isOff ? undefined : r.shiftEnd || undefined,
          shiftHours: r.isOff ? undefined : r.shiftHours,
          isOff: r.isOff,
          branchId,
          tenantId,
        }));

      const deleteIds = rows
        .filter((r) => r.toDelete && r.id)
        .map((r) => r.id!);

      await onSave(toSave, deleteIds);
    } finally {
      setSaving(false);
    }
  }

  const displayDate = (() => {
    try {
      const d = parseISO(date);
      return format(d, "EEEE, d MMMM yyyy");
    } catch {
      return date;
    }
  })();

  const activeRows = rows.filter((r) => !r.toDelete);

  const selectClass = cn(
    "h-10 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
    "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
    "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full bg-surface shadow-2xl flex flex-col",
          "w-full sm:w-[420px]",
          "animate-in slide-in-from-right duration-300"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-200">
          <div>
            <h2 className="text-base font-semibold text-base-900 font-display">
              Edit Shifts
            </h2>
            <p className="text-sm text-base-400 mt-0.5">{displayDate}</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-base-600 hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {activeRows.map((_row, visualIndex) => {
              // Map visual index to actual index in the rows array
              let actualIndex = -1;
              let count = 0;
              for (let i = 0; i < rows.length; i++) {
                if (!rows[i].toDelete) {
                  if (count === visualIndex) {
                    actualIndex = i;
                    break;
                  }
                  count++;
                }
              }
              const row = rows[actualIndex];

              return (
                <div
                  key={row.id ?? `new-${visualIndex}`}
                  className="rounded-xl border border-base-200 p-4 bg-surface-2"
                >
                  {/* Staff select */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-base-600 mb-1 block">
                      Staff Member
                    </label>
                    <select
                      value={row.staffId}
                      onChange={(e) =>
                        handleRowChange(actualIndex, { staffId: e.target.value })
                      }
                      className={cn(selectClass, "w-full")}
                    >
                      <option value="">Select staff...</option>
                      {staff
                        .filter((s) => s.active !== false)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.first_name} {s.last_name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Day Off toggle */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.isOff}
                      onClick={() =>
                        handleRowChange(actualIndex, { isOff: !row.isOff })
                      }
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        row.isOff ? "bg-accent" : "bg-base-200"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          row.isOff && "translate-x-5"
                        )}
                      />
                    </button>
                    <span className="text-sm text-base-700">Day Off</span>
                  </div>

                  {/* Times */}
                  {!row.isOff && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-base-600 mb-1 block">
                          Start
                        </label>
                        <input
                          type="time"
                          value={row.shiftStart}
                          onChange={(e) =>
                            handleRowChange(actualIndex, {
                              shiftStart: e.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border border-base-200 bg-surface px-2 text-sm font-mono text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-base-600 mb-1 block">
                          End
                        </label>
                        <input
                          type="time"
                          value={row.shiftEnd}
                          onChange={(e) =>
                            handleRowChange(actualIndex, {
                              shiftEnd: e.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border border-base-200 bg-surface px-2 text-sm font-mono text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-base-600 mb-1 block">
                          Hours
                        </label>
                        <div className="h-10 rounded-lg border border-base-200 bg-surface-3 px-2 flex items-center text-sm font-mono text-base-700">
                          {row.shiftHours.toFixed(1)}h
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Remove button */}
                  {activeRows.length > 1 && (
                    <button
                      onClick={() => removeRow(actualIndex)}
                      className="mt-3 flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 transition-colors"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Shift button */}
          <button
            onClick={addRow}
            className="mt-4 w-full h-11 rounded-lg border-2 border-dashed border-base-200 flex items-center justify-center gap-2 text-sm font-medium text-base-600 hover:border-accent hover:text-accent transition-colors"
          >
            <Plus size={16} />
            Add Shift
          </button>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-base-200 px-5 py-4 bg-surface flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </>
  );
}
