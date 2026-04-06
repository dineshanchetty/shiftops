"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DriverFromRoster } from "@/app/app/cashup/actions";

export interface DriverEntryRow {
  staff_id: string;
  first_name: string;
  last_name: string;
  turnover: number | null;
  wages: number | null;
  charges: number | null;
  delivery_count: number | null;
  fuel_cost: number | null;
  gratuities: number | null;
  fromRoster: boolean;
}

interface DriverTableProps {
  drivers: DriverFromRoster[];
  entries: DriverEntryRow[];
  onChange: (entries: DriverEntryRow[]) => void;
  allStaff?: { id: string; first_name: string; last_name: string }[];
  readOnly?: boolean;
}

export function DriverTable({
  entries,
  onChange,
  allStaff,
  readOnly,
}: DriverTableProps) {
  function updateEntry(
    index: number,
    field: keyof DriverEntryRow,
    value: string | number | null
  ) {
    const updated = entries.map((entry, i) => {
      if (i !== index) return entry;
      return { ...entry, [field]: value };
    });
    onChange(updated);
  }

  function addManualDriver() {
    onChange([
      ...entries,
      {
        staff_id: "",
        first_name: "",
        last_name: "",
        turnover: null,
        wages: null,
        charges: null,
        delivery_count: null,
        fuel_cost: null,
        gratuities: null,
        fromRoster: false,
      },
    ]);
  }

  function removeDriver(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  const numericCellClass =
    "h-9 w-full rounded-md border border-base-200 bg-surface px-2 text-right font-mono text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-50";

  if (entries.length === 0 && readOnly) {
    return (
      <p className="text-sm text-base-400 italic">No driver entries recorded.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-base-400 uppercase tracking-wide">
              <th className="text-left py-2 px-1 font-medium min-w-[140px]">
                Driver
              </th>
              <th className="text-right py-2 px-1 font-medium w-20">
                Turnover
              </th>
              <th className="text-right py-2 px-1 font-medium w-20">Wages</th>
              <th className="text-right py-2 px-1 font-medium w-20">
                Charges
              </th>
              <th className="text-right py-2 px-1 font-medium w-16">
                Del.
              </th>
              <th className="text-right py-2 px-1 font-medium w-20">Fuel</th>
              <th className="text-right py-2 px-1 font-medium w-20">
                Grat.
              </th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={index} className="align-middle">
                <td className="py-1 px-1">
                  {entry.fromRoster ? (
                    <span className="text-sm text-base-500">
                      {entry.first_name} {entry.last_name}
                    </span>
                  ) : (
                    <select
                      className="h-9 w-full rounded-md border border-base-200 bg-surface px-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent"
                      value={entry.staff_id}
                      onChange={(e) => {
                        const staff = allStaff?.find(
                          (s) => s.id === e.target.value
                        );
                        if (staff) {
                          const updated = entries.map((ent, i) => {
                            if (i !== index) return ent;
                            return {
                              ...ent,
                              staff_id: staff.id,
                              first_name: staff.first_name,
                              last_name: staff.last_name,
                            };
                          });
                          onChange(updated);
                        }
                      }}
                      disabled={readOnly}
                    >
                      <option value="">Select driver...</option>
                      {allStaff?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.first_name} {s.last_name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="py-1 px-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className={numericCellClass}
                    value={entry.turnover ?? ""}
                    onChange={(e) =>
                      updateEntry(
                        index,
                        "turnover",
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    disabled={readOnly}
                  />
                </td>
                <td className="py-1 px-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className={numericCellClass}
                    value={entry.wages ?? ""}
                    onChange={(e) =>
                      updateEntry(
                        index,
                        "wages",
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    disabled={readOnly}
                  />
                </td>
                <td className="py-1 px-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className={numericCellClass}
                    value={entry.charges ?? ""}
                    onChange={(e) =>
                      updateEntry(
                        index,
                        "charges",
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    disabled={readOnly}
                  />
                </td>
                <td className="py-1 px-1">
                  <input
                    type="number"
                    step="1"
                    placeholder="0"
                    className={numericCellClass}
                    value={entry.delivery_count ?? ""}
                    onChange={(e) =>
                      updateEntry(
                        index,
                        "delivery_count",
                        e.target.value === ""
                          ? null
                          : parseInt(e.target.value, 10)
                      )
                    }
                    disabled={readOnly}
                  />
                </td>
                <td className="py-1 px-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className={numericCellClass}
                    value={entry.fuel_cost ?? ""}
                    onChange={(e) =>
                      updateEntry(
                        index,
                        "fuel_cost",
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    disabled={readOnly}
                  />
                </td>
                <td className="py-1 px-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className={numericCellClass}
                    value={entry.gratuities ?? ""}
                    onChange={(e) =>
                      updateEntry(
                        index,
                        "gratuities",
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    disabled={readOnly}
                  />
                </td>
                {!readOnly && (
                  <td className="py-1 px-1">
                    {!entry.fromRoster && (
                      <button
                        type="button"
                        onClick={() => removeDriver(index)}
                        className="p-1 rounded-md text-base-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="Remove driver"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addManualDriver}
        >
          <Plus size={14} />
          Add Driver
        </Button>
      )}
    </div>
  );
}
