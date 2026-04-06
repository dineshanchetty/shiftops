"use server";

import { createClient } from "@/lib/supabase/server";
import type { RosterEntry } from "@/lib/types";

export async function getRosterEntries(
  branchId: string,
  startDate: string,
  endDate: string,
  positionId?: string,
  subPositionId?: string
): Promise<{ data: (RosterEntry & { staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null } })[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("roster_entries")
    .select(
      "*, staff!inner(first_name, last_name, position_id, sub_position_id)"
    )
    .eq("branch_id", branchId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (positionId) {
    query = query.eq("staff.position_id", positionId);
  }

  if (subPositionId) {
    query = query.eq("staff.sub_position_id", subPositionId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []) as (RosterEntry & { staff: { first_name: string; last_name: string; position_id: string | null; sub_position_id: string | null } })[],
    error: null,
  };
}

export async function saveRosterEntries(
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
  }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const upsertRows = entries.map((e) => ({
    ...(e.id ? { id: e.id } : {}),
    staff_id: e.staffId,
    date: e.date,
    shift_start: e.isOff ? null : (e.shiftStart ?? null),
    shift_end: e.isOff ? null : (e.shiftEnd ?? null),
    shift_hours: e.isOff ? null : (e.shiftHours ?? null),
    is_off: e.isOff,
    branch_id: e.branchId,
    tenant_id: e.tenantId,
  }));

  const { error } = await supabase
    .from("roster_entries")
    .upsert(upsertRows, { onConflict: "id" });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function deleteRosterEntry(
  entryId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("roster_entries")
    .delete()
    .eq("id", entryId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
