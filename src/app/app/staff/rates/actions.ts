"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

export interface StaffRateRow {
  staff_id: string;
  first_name: string;
  last_name: string;
  branch_id: string | null;
  branch_name: string | null;
  current_rate: number | null;
  current_effective_from: string | null;
}

/** Load every active staff member with their current (open-ended) rate. */
export async function listStaffRates(): Promise<
  { ok: true; rows: StaffRateRow[] } | { ok: false; error: string }
> {
  const guard = await requirePermission("staff.rate.edit");
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  // Branch scoping — owners see all; non-owners restricted to their branches.
  const { data: allowed } = await supabase.rpc("get_user_branch_ids");

  // Disambiguate the branches embed — staff has TWO relationships to branches
  // (the primary staff.branch_id FK and the staff_branches m2m), so a bare
  // `branches(name)` errors with "more than one relationship was found".
  let staffQuery = supabase
    .from("staff")
    .select("id, first_name, last_name, branch_id, branches!staff_branch_id_fkey(name)")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (Array.isArray(allowed)) {
    if (allowed.length === 0) return { ok: true, rows: [] };
    staffQuery = staffQuery.in("branch_id", allowed as string[]);
  }
  const { data: staff, error: staffErr } = await staffQuery.order("first_name");
  if (staffErr) return { ok: false, error: staffErr.message };

  // Current rates (open-ended) for these staff.
  const staffIds = (staff ?? []).map((s) => s.id as string);
  const rateMap = new Map<string, { rate: number; from: string }>();
  if (staffIds.length > 0) {
    const { data: rates } = await supabase
      .from("staff_rates")
      .select("staff_id, hourly_rate, effective_from")
      .in("staff_id", staffIds)
      .is("effective_to", null);
    for (const r of rates ?? []) {
      rateMap.set(r.staff_id as string, {
        rate: Number(r.hourly_rate),
        from: r.effective_from as string,
      });
    }
  }

  const rows: StaffRateRow[] = (staff ?? []).map((s) => {
    const cur = rateMap.get(s.id as string);
    const branch = (s as { branches?: { name?: string } | { name?: string }[] | null }).branches;
    const branchName = Array.isArray(branch) ? branch[0]?.name ?? null : branch?.name ?? null;
    return {
      staff_id: s.id as string,
      first_name: s.first_name as string,
      last_name: s.last_name as string,
      branch_id: (s.branch_id as string | null) ?? null,
      branch_name: branchName,
      current_rate: cur?.rate ?? null,
      current_effective_from: cur?.from ?? null,
    };
  });

  return { ok: true, rows };
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Apply new hourly rates to many staff at once, all effective from the same
 * date. For each staff we close the current open-ended rate (effective_to =
 * day before the new date) — or delete it if it was future-dated on/after the
 * new date — then insert the new open-ended rate. Rows whose new rate equals
 * the current rate are skipped so we don't spam the history.
 */
export async function bulkUpdateRates(
  effectiveDate: string,
  updates: { staff_id: string; rate: number }[]
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const guard = await requirePermission("staff.rate.edit");
  if (!guard.ok) return guard;

  if (!effectiveDate) return { ok: false, error: "Pick an effective date." };
  if (updates.length === 0) return { ok: true, updated: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const staffIds = updates.map((u) => u.staff_id);
  const { data: currentRates } = await supabase
    .from("staff_rates")
    .select("id, staff_id, hourly_rate, effective_from")
    .in("staff_id", staffIds)
    .is("effective_to", null);
  const currentByStaff = new Map(
    (currentRates ?? []).map((r) => [
      r.staff_id as string,
      { id: r.id as string, rate: Number(r.hourly_rate), from: r.effective_from as string },
    ])
  );

  let updated = 0;
  const toInsert: {
    staff_id: string;
    tenant_id: string;
    hourly_rate: number;
    effective_from: string;
    effective_to: null;
    created_by: string | null;
  }[] = [];

  for (const u of updates) {
    if (Number.isNaN(u.rate) || u.rate < 0) continue;
    const cur = currentByStaff.get(u.staff_id);
    // Skip no-ops (same rate already active).
    if (cur && cur.rate === u.rate) continue;

    if (cur) {
      if (cur.from < effectiveDate) {
        await supabase
          .from("staff_rates")
          .update({ effective_to: dayBefore(effectiveDate) })
          .eq("id", cur.id)
          .eq("tenant_id", tenantId);
      } else {
        // current rate is dated on/after the new date — replace it
        await supabase
          .from("staff_rates")
          .delete()
          .eq("id", cur.id)
          .eq("tenant_id", tenantId);
      }
    }

    toInsert.push({
      staff_id: u.staff_id,
      tenant_id: tenantId,
      hourly_rate: u.rate,
      effective_from: effectiveDate,
      effective_to: null,
      created_by: user?.id ?? null,
    });
    updated++;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("staff_rates").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/app/staff/rates");
  return { ok: true, updated };
}
