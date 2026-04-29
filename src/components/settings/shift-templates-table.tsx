"use client";

/**
 * Shift Templates editor (per branch)
 *
 * Reusable named shifts (e.g. "Morning 06:00–14:00") that managers
 * pick from a dropdown on the roster instead of typing custom times.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Save, ToggleLeft, ToggleRight } from "lucide-react";

interface ShiftTemplate {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  shift_start: string;
  shift_end: string;
  is_active: boolean;
  position_id: string | null;
  sort_order: number;
}

interface ShiftTemplatesTableProps {
  branchId: string;
  tenantId: string;
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

export function ShiftTemplatesTable({ branchId, tenantId }: ShiftTemplatesTableProps) {
  const supabase = createClient();

  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // New row form state
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("06:00");
  const [newEnd, setNewEnd] = useState("14:00");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("shift_templates")
      .select("*")
      .eq("branch_id", branchId)
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("shift_start");
    if (error) {
      console.error("Load templates failed:", error.message);
    }
    setTemplates((data ?? []) as ShiftTemplate[]);
    setLoading(false);
  }, [branchId, tenantId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTemplate() {
    if (!newName.trim() || !newStart || !newEnd) return;
    setAdding(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("shift_templates").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name: newName.trim(),
      shift_start: newStart,
      shift_end: newEnd,
      is_active: true,
      sort_order: templates.length,
    });
    if (error) {
      alert(`Could not add template: ${error.message}`);
    } else {
      setNewName("");
      setNewStart("06:00");
      setNewEnd("14:00");
      await load();
    }
    setAdding(false);
  }

  async function updateTemplate(id: string, patch: Partial<ShiftTemplate>) {
    setSavingId(id);
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("shift_templates")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) console.error("Update failed:", error.message);
    setSavingId(null);
  }

  async function removeTemplate(id: string) {
    if (!confirm("Delete this shift template? Existing roster entries will keep their times.")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("shift_templates")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) {
      alert(`Could not delete: ${error.message}`);
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift Templates</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-base-500 mb-4">
          Define reusable shifts for this branch. Managers pick from these on the roster instead of typing times.
        </p>

        {/* Existing templates */}
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="animate-spin mx-auto text-accent" size={20} /></div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-200 p-6 text-center text-sm text-base-400 mb-4">
            No shift templates yet. Add one below.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-base-200 mb-4">
            <table className="w-full text-sm">
              <thead className="bg-base-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-base-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">End</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-center">Active</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const hrs = calcHours(t.shift_start, t.shift_end);
                  return (
                    <tr key={t.id} className="border-t border-base-100 hover:bg-base-50/50">
                      <td className="px-3 py-1.5">
                        <input
                          className="w-full bg-transparent border-none outline-none text-sm font-medium focus:bg-white focus:ring-1 focus:ring-accent rounded px-1.5"
                          value={t.name}
                          onChange={(e) => updateTemplate(t.id, { name: e.target.value })}
                          onBlur={(e) => updateTemplate(t.id, { name: e.target.value.trim() })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="time"
                          className="bg-transparent border-none outline-none text-sm font-mono focus:bg-white focus:ring-1 focus:ring-accent rounded px-1.5"
                          value={t.shift_start.slice(0, 5)}
                          onChange={(e) => updateTemplate(t.id, { shift_start: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="time"
                          className="bg-transparent border-none outline-none text-sm font-mono focus:bg-white focus:ring-1 focus:ring-accent rounded px-1.5"
                          value={t.shift_end.slice(0, 5)}
                          onChange={(e) => updateTemplate(t.id, { shift_end: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-mono text-base-500">
                        {hrs > 0 ? `${hrs}h` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => updateTemplate(t.id, { is_active: !t.is_active })}
                          className="text-base-500 hover:text-accent transition-colors"
                          title={t.is_active ? "Deactivate" : "Activate"}
                        >
                          {t.is_active ? (
                            <ToggleRight size={20} className="text-green-600" />
                          ) : (
                            <ToggleLeft size={20} className="text-base-300" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {savingId === t.id && (
                          <Save size={12} className="inline text-accent mr-2" />
                        )}
                        <button
                          onClick={() => removeTemplate(t.id)}
                          className="text-base-300 hover:text-red-500 transition-colors p-1"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add new */}
        <div className="rounded-lg border border-base-200 bg-surface p-3">
          <div className="text-xs font-semibold text-base-500 uppercase tracking-wider mb-2">Add new template</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] text-base-400 mb-1">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Morning"
                compact
              />
            </div>
            <div>
              <label className="block text-[10px] text-base-400 mb-1">Start</label>
              <input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="h-9 rounded-lg border border-base-200 bg-white px-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-base-400 mb-1">End</label>
              <input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="h-9 rounded-lg border border-base-200 bg-white px-2 text-sm font-mono"
              />
            </div>
            <Button onClick={addTemplate} disabled={adding || !newName.trim()} size="sm">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
