"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { Position, SubPosition, Branch } from "@/lib/types";

interface InviteModalProps {
  tenantId: string;
  positions: Position[];
  subPositions: SubPosition[];
  branches: Branch[];
  onClose: () => void;
  onInvited: () => void;
}

const selectClass = cn(
  "w-full h-10 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
  "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
  "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
);

export function InviteModal({
  tenantId,
  positions,
  subPositions,
  branches,
  onClose,
  onInvited,
}: InviteModalProps) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    position_id: "",
    sub_position_id: "",
    branch_id: branches[0]?.id ?? "",
    employment_type: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredSubPositions = subPositions.filter(
    (sp) => sp.position_id === form.position_id
  );

  // Reset sub-position when position changes
  useEffect(() => {
    setForm((f) => ({ ...f, sub_position_id: "" }));
  }, [form.position_id]);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.branch_id) {
      setError("First name, last name, and branch are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("staff").insert({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        position_id: form.position_id || null,
        sub_position_id: form.sub_position_id || null,
        branch_id: form.branch_id,
        employment_type: form.employment_type || null,
        tenant_id: tenantId,
        active: true,
      });

      if (insertError) throw insertError;
      onInvited();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add staff member.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base-200">
            <h2 className="text-base font-semibold text-base-900 font-display">
              Add Staff Member
            </h2>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-lg flex items-center justify-center text-base-600 hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First Name *"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                placeholder="John"
              />
              <Input
                label="Last Name *"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                placeholder="Smith"
              />
            </div>

            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="john@example.com"
            />

            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="082 123 4567"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-base-700">
                Position
              </label>
              <select
                value={form.position_id}
                onChange={(e) => update("position_id", e.target.value)}
                className={selectClass}
              >
                <option value="">Select position...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-base-700">
                Sub-position
              </label>
              <select
                value={form.sub_position_id}
                onChange={(e) => update("sub_position_id", e.target.value)}
                className={selectClass}
                disabled={!form.position_id}
              >
                <option value="">Select sub-position...</option>
                {filteredSubPositions.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-base-700">
                Branch *
              </label>
              <select
                value={form.branch_id}
                onChange={(e) => update("branch_id", e.target.value)}
                className={selectClass}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-base-700">
                Employment Type
              </label>
              <select
                value={form.employment_type}
                onChange={(e) => update("employment_type", e.target.value)}
                className={selectClass}
              >
                <option value="">Select type...</option>
                <option value="permanent">Permanent</option>
                <option value="fixed_term">Fixed Term</option>
                <option value="casual">Casual</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}
          </form>

          {/* Footer */}
          <div className="border-t border-base-200 px-6 py-4 flex gap-3 justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={saving || !form.first_name || !form.last_name || !form.branch_id}
            >
              {saving ? "Adding..." : "Add Staff"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
