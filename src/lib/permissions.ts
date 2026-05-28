/**
 * Server-side permission helpers.
 *
 * Roles (tenant_members.role):
 *   • owner   — full control ("Admin Rights")
 *   • manager — input data only; cannot unlock posted cashups; no rate edits
 *
 * These helpers are used by server actions as defense-in-depth on top of RLS
 * (see migration 015_rbac_lock.sql). RLS is the final gate, but checking here
 * lets us return clean error messages instead of opaque Postgres errors.
 */

import { createClient } from "@/lib/supabase/server";

export type UserRole = "owner" | "manager" | "staff";

export async function getCurrentRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_user_role");
  return (data as UserRole | null) ?? null;
}

/**
 * Returns `{ ok: true }` if the caller is an owner, else `{ ok: false, error }`.
 * Pattern: `const guard = await requireOwner(); if (!guard.ok) return guard;`
 */
export async function requireOwner(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const role = await getCurrentRole();
  if (role !== "owner") {
    return {
      ok: false,
      error: "Only Admin users can perform this action.",
    };
  }
  return { ok: true };
}
