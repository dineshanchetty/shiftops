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
 *
 * Kept for cases that genuinely need full admin (settings layout root guard,
 * role management, manual user creation). For everything else prefer
 * requirePermission(key) so custom roles can grant access.
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

/**
 * Returns `{ ok: true }` if the caller is an owner OR has the given permission
 * via their role. Backed by the SQL `has_permission(text)` function.
 *
 * Pattern:
 *   const guard = await requirePermission("cashup.unlock");
 *   if (!guard.ok) return guard;
 */
export async function requirePermission(
  permissionKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_permission", { p_key: permissionKey });
  if (data === true) return { ok: true };
  return {
    ok: false,
    error: `Your role doesn't have the "${permissionKey}" permission.`,
  };
}

/** Check a permission without throwing. Returns false on error/unauth. */
export async function checkPermission(permissionKey: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_permission", { p_key: permissionKey });
  return data === true;
}
