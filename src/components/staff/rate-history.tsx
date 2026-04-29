"use client";

/**
 * Hourly rate editor + history for a staff member.
 *
 * - Reads `staff_rates` rows for the staff
 * - Shows the current rate large and a chronological history below
 * - "Update rate" opens an inline form: new rate + effective date
 * - On save: closes the previous rate row (effective_to = new effective_from - 1)
 *   and inserts the new row.
 *
 * Past rates remain in the history so old rosters preserve original cost.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, History } from "lucide-react";

interface StaffRate {
  id: string;
  hourly_rate: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string | null;
}

interface RateHistoryProps {
  staffId: string;
  tenantId: string;
}

function formatZAR(n: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RateHistory({ staffId, tenantId }: RateHistoryProps) {
  const supabase = createClient();
  const [rates, setRates] = useState<StaffRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [newEffective, setNewEffective] = useState(todayDateStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("staff_rates")
      .select("*")
      .eq("staff_id", staffId)
      .order("effective_from", { ascending: false });
    if (error) console.error("Load rates failed:", error.message);
    setRates((data ?? []) as StaffRate[]);
    setLoading(false);
  }, [staffId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveRate() {
    setError(null);
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) {
      setError("Enter a valid rate");
      return;
    }
    if (!newEffective) {
      setError("Pick an effective date");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Close any currently-active rate (effective_to IS NULL)
      const current = rates.find((r) => r.effective_to === null);
      if (current && current.effective_from < newEffective) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("staff_rates")
          .update({ effective_to: dayBefore(newEffective) })
          .eq("id", current.id)
          .eq("tenant_id", tenantId);
      } else if (current && current.effective_from >= newEffective) {
        // Replacing an existing future-dated rate — delete it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("staff_rates")
          .delete()
          .eq("id", current.id)
          .eq("tenant_id", tenantId);
      }

      // Insert new active rate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase as any).from("staff_rates").insert({
        staff_id: staffId,
        tenant_id: tenantId,
        hourly_rate: rate,
        effective_from: newEffective,
        effective_to: null,
        created_by: user?.id ?? null,
      });
      if (insertErr) throw new Error(insertErr.message);

      setNewRate("");
      setNewEffective(todayDateStr());
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rate");
    } finally {
      setSaving(false);
    }
  }

  const current = rates.find((r) => r.effective_to === null);
  const past = rates.filter((r) => r.effective_to !== null);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-base-500">Hourly Rate</h3>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs font-medium text-accent hover:underline"
          >
            <Plus size={12} className="inline" /> Update rate
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="animate-spin text-base-300" size={18} /></div>
      ) : (
        <div className="rounded-lg border border-base-200 bg-surface p-4">
          {/* Current rate */}
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-bold font-mono text-base-900">
                {current ? formatZAR(current.hourly_rate) : "—"}
                {current && <span className="text-sm font-normal text-base-400 ml-1">/hr</span>}
              </div>
              {current && (
                <div className="text-xs text-base-500 mt-1">
                  Effective from {new Date(current.effective_from + "T00:00:00").toLocaleDateString("en-ZA")}
                </div>
              )}
              {!current && !loading && (
                <div className="text-xs text-base-400 mt-1">No rate set</div>
              )}
            </div>
          </div>

          {/* Add new rate form */}
          {showAdd && (
            <div className="mt-4 pt-4 border-t border-base-200">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[10px] text-base-400 mb-1">New rate (ZAR/hour)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    placeholder="e.g. 45.00"
                    className="h-9 w-full rounded-lg border border-base-200 bg-white px-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-base-400 mb-1">Effective from</label>
                  <input
                    type="date"
                    value={newEffective}
                    onChange={(e) => setNewEffective(e.target.value)}
                    className="h-9 rounded-lg border border-base-200 bg-white px-2 text-sm"
                  />
                </div>
                <Button onClick={handleSaveRate} disabled={saving} size="sm">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setError(null); }}>
                  Cancel
                </Button>
              </div>
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>
          )}

          {/* History */}
          {past.length > 0 && (
            <div className="mt-4 pt-4 border-t border-base-200">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-400 mb-2">
                <History size={10} />
                Previous rates
              </div>
              <div className="space-y-1.5">
                {past.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-base-600">
                    <span className="font-mono">
                      {new Date(r.effective_from + "T00:00:00").toLocaleDateString("en-ZA")} → {r.effective_to ? new Date(r.effective_to + "T00:00:00").toLocaleDateString("en-ZA") : "—"}
                    </span>
                    <span className="font-mono font-semibold">{formatZAR(r.hourly_rate)}/hr</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
