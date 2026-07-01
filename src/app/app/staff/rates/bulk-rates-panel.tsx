"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkUpdateRates, type StaffRateRow } from "./actions";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Wand2 } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BulkRatesPanel({ rows }: { rows: StaffRateRow[] }) {
  const router = useRouter();
  const [effectiveDate, setEffectiveDate] = useState(todayStr());
  const [applyAll, setApplyAll] = useState("");
  // Map staff_id → new rate string (empty = leave unchanged).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Group by branch for readability.
  const grouped = useMemo(() => {
    const m = new Map<string, StaffRateRow[]>();
    for (const r of rows) {
      const key = r.branch_name ?? "Unassigned";
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const changedCount = useMemo(
    () =>
      rows.filter((r) => {
        const v = edits[r.staff_id];
        if (v === undefined || v === "") return false;
        const n = parseFloat(v);
        return !Number.isNaN(n) && n !== r.current_rate;
      }).length,
    [edits, rows]
  );

  function applyToAll() {
    const v = applyAll.trim();
    if (!v) return;
    const next: Record<string, string> = {};
    for (const r of rows) next[r.staff_id] = v;
    setEdits(next);
  }

  function handleSave() {
    setFeedback(null);
    const updates = rows
      .map((r) => {
        const v = edits[r.staff_id];
        if (v === undefined || v === "") return null;
        const n = parseFloat(v);
        if (Number.isNaN(n) || n < 0) return null;
        if (n === r.current_rate) return null;
        return { staff_id: r.staff_id, rate: n };
      })
      .filter((x): x is { staff_id: string; rate: number } => x !== null);

    if (updates.length === 0) {
      setFeedback({ type: "err", text: "No changed rates to save." });
      return;
    }

    start(async () => {
      const res = await bulkUpdateRates(effectiveDate, updates);
      if (res.ok) {
        setFeedback({ type: "ok", text: `Updated ${res.updated} staff rate${res.updated === 1 ? "" : "s"}.` });
        setEdits({});
        setApplyAll("");
        router.refresh();
      } else {
        setFeedback({ type: "err", text: res.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-base-200 bg-surface p-4">
        <div>
          <label className="text-xs font-medium text-base-600 block mb-1.5">Effective from</label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={busy}
            className="h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-base-600 block mb-1.5">Apply one rate to all</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={applyAll}
              onChange={(e) => setApplyAll(e.target.value)}
              placeholder="e.g. 30.81"
              disabled={busy}
              className="h-10 w-32 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
            />
            <Button type="button" variant="secondary" onClick={applyToAll} disabled={busy || !applyAll.trim()}>
              <Wand2 size={14} /> Fill all
            </Button>
          </div>
        </div>
        <div className="ml-auto">
          <Button onClick={handleSave} disabled={busy || changedCount === 0}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Save {changedCount > 0 ? `(${changedCount})` : ""}
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            feedback.type === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-base-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 border-b border-base-200">
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">Staff</th>
              <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide font-semibold text-base-400">Current rate</th>
              <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide font-semibold text-base-400">New rate</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([branch, staffRows]) => (
              <BranchGroup
                key={branch}
                branch={branch}
                rows={staffRows}
                edits={edits}
                setEdits={setEdits}
                busy={busy}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-base-400">
                  No active staff found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BranchGroup({
  branch,
  rows,
  edits,
  setEdits,
  busy,
}: {
  branch: string;
  rows: StaffRateRow[];
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busy: boolean;
}) {
  return (
    <>
      <tr className="bg-base-50">
        <td colSpan={3} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-base-500">
          {branch} · {rows.length}
        </td>
      </tr>
      {rows.map((r) => {
        const v = edits[r.staff_id] ?? "";
        const n = v === "" ? null : parseFloat(v);
        const changed = n !== null && !Number.isNaN(n) && n !== r.current_rate;
        return (
          <tr key={r.staff_id} className="border-b border-base-100 last:border-b-0">
            <td className="px-4 py-2 text-base-900">
              {r.first_name} {r.last_name}
            </td>
            <td className="px-4 py-2 text-right font-mono text-base-600">
              {r.current_rate != null ? `R ${r.current_rate.toFixed(2)}` : "—"}
            </td>
            <td className="px-4 py-2 text-right">
              <input
                type="number"
                step="0.01"
                min="0"
                value={v}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [r.staff_id]: e.target.value }))
                }
                placeholder={r.current_rate != null ? r.current_rate.toFixed(2) : "0.00"}
                disabled={busy}
                className={`h-8 w-28 px-2 rounded border text-sm text-right font-mono outline-none focus:border-accent ${
                  changed ? "border-accent bg-accent/5" : "border-base-200 bg-white"
                }`}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}
