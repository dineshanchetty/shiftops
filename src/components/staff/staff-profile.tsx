"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { RateHistory } from "@/components/staff/rate-history";
import type { Staff, Position, SubPosition, Branch } from "@/lib/types";

interface StaffProfileProps {
  staff: Staff;
  positions: Position[];
  subPositions: SubPosition[];
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}

const selectClass = cn(
  "w-full h-10 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
  "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
  "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
);

export function StaffProfile({
  staff,
  positions,
  subPositions,
  branches,
  onClose,
  onSaved,
}: StaffProfileProps) {
  const [form, setForm] = useState({
    first_name: staff.first_name,
    last_name: staff.last_name,
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    id_number: staff.id_number ?? "",
    position_id: staff.position_id ?? "",
    sub_position_id: staff.sub_position_id ?? "",
    employment_type: staff.employment_type ?? "",
    branch_id: staff.branch_id,
    start_date: staff.start_date ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);

  // Filter sub-positions by selected position
  const filteredSubPositions = subPositions.filter(
    (sp) => sp.position_id === form.position_id
  );

  // Reset sub-position when position changes
  useEffect(() => {
    if (
      form.position_id !== staff.position_id &&
      form.sub_position_id
    ) {
      const valid = subPositions.some(
        (sp) =>
          sp.position_id === form.position_id &&
          sp.id === form.sub_position_id
      );
      if (!valid) {
        setForm((f) => ({ ...f, sub_position_id: "" }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.position_id]);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("staff")
        .update({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || null,
          phone: form.phone || null,
          id_number: form.id_number || null,
          position_id: form.position_id || null,
          sub_position_id: form.sub_position_id || null,
          employment_type: form.employment_type || null,
          branch_id: form.branch_id,
          start_date: form.start_date || null,
        })
        .eq("id", staff.id);

      if (error) throw error;
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    const supabase = createClient();
    await supabase
      .from("staff")
      .update({ active: !(staff.active !== false) })
      .eq("id", staff.id);
    onSaved();
  }

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
          <h2 className="text-base font-semibold text-base-900 font-display">
            {staff.first_name} {staff.last_name}
          </h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-base-600 hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Personal Details */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-base-400 mb-3">
              Personal Details
            </h3>
            <div className="space-y-3">
              <Input
                label="First Name"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
              />
              <Input
                label="Last Name"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
              <Input
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
              <Input
                label="ID Number"
                value={form.id_number}
                onChange={(e) => update("id_number", e.target.value)}
              />
            </div>
          </section>

          {/* Employment */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-base-400 mb-3">
              Employment
            </h3>
            <div className="space-y-3">
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

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-base-700">
                  Branch
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

              <Input
                label="Start Date"
                type="date"
                value={form.start_date}
                onChange={(e) => update("start_date", e.target.value)}
              />
            </div>
          </section>

          {/* Hourly Rate */}
          <section>
            <RateHistory staffId={staff.id} tenantId={staff.tenant_id} />
          </section>

          {/* Danger Zone */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-3">
              Danger Zone
            </h3>
            {!showDeactivate ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeactivate(true)}
              >
                {staff.active !== false ? "Deactivate Staff" : "Activate Staff"}
              </Button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700 mb-3">
                  {staff.active !== false
                    ? "Are you sure you want to deactivate this staff member? They will no longer appear in rosters."
                    : "Re-activate this staff member?"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeactivate}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowDeactivate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-base-200 px-5 py-4 bg-surface flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !form.first_name || !form.last_name}
            className="flex-1"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </>
  );
}
