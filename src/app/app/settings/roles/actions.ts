"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/permissions";

export interface PermissionCatalog {
  key: string;
  description: string;
  category: string;
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  member_count: number;
}

/** List all permissions in the global catalog. Public to any signed-in tenant member. */
export async function listPermissions(): Promise<PermissionCatalog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("permissions")
    .select("key, description, category")
    .order("category", { ascending: true })
    .order("key", { ascending: true });
  return (data ?? []) as PermissionCatalog[];
}

/** List all roles for the caller's tenant + the permission keys granted to each. */
export async function listRoles(): Promise<
  { ok: true; roles: RoleWithPermissions[] } | { ok: false; error: string }
> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const [{ data: roles, error: rolesErr }, { data: grants }, { data: counts }] =
    await Promise.all([
      supabase
        .from("roles")
        .select("id, name, description, is_system")
        .eq("tenant_id", tenantId)
        .order("is_system", { ascending: false })
        .order("name", { ascending: true }),
      supabase.from("role_permissions").select("role_id, permission_key"),
      supabase
        .from("tenant_members")
        .select("role_id")
        .eq("tenant_id", tenantId),
    ]);
  if (rolesErr) return { ok: false, error: rolesErr.message };

  const permsByRole = new Map<string, string[]>();
  for (const g of grants ?? []) {
    const arr = permsByRole.get(g.role_id as string) ?? [];
    arr.push(g.permission_key as string);
    permsByRole.set(g.role_id as string, arr);
  }

  const countByRole = new Map<string, number>();
  for (const c of counts ?? []) {
    if (!c.role_id) continue;
    countByRole.set(c.role_id as string, (countByRole.get(c.role_id as string) ?? 0) + 1);
  }

  return {
    ok: true,
    roles: (roles ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      is_system: r.is_system as boolean,
      permissions: permsByRole.get(r.id as string) ?? [],
      member_count: countByRole.get(r.id as string) ?? 0,
    })),
  };
}

export async function createRole(
  name: string,
  description: string,
  permissionKeys: string[]
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Role name is required." };
  if (trimmed.length > 50) return { ok: false, error: "Role name too long." };

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  // Reject collisions with the system role names so customers don't shadow them.
  if (trimmed.toLowerCase() === "admin" || trimmed.toLowerCase() === "manager") {
    return { ok: false, error: `"${trimmed}" is a reserved system role name.` };
  }

  const { data: created, error } = await supabase
    .from("roles")
    .insert({
      tenant_id: tenantId,
      name: trimmed,
      description: description.trim() || null,
      is_system: false,
    })
    .select("id")
    .single();
  if (error || !created)
    return { ok: false, error: error?.message ?? "Failed to create role" };

  if (permissionKeys.length > 0) {
    const { error: grantErr } = await supabase.from("role_permissions").insert(
      permissionKeys.map((k) => ({
        role_id: created.id as string,
        permission_key: k,
      }))
    );
    if (grantErr) return { ok: false, error: grantErr.message };
  }

  revalidatePath("/app/settings/roles");
  return { ok: true, id: created.id as string };
}

/**
 * Update a role's name + description + permission set.
 * System roles (is_system=true) can have their permissions edited but not
 * their name (renaming Admin would be confusing). Caller passes the full
 * desired permission set — we delete + re-insert as a diff.
 */
export async function updateRole(
  roleId: string,
  name: string,
  description: string,
  permissionKeys: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const { data: existing } = await supabase
    .from("roles")
    .select("id, is_system, name")
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .single();
  if (!existing) return { ok: false, error: "Role not found" };

  // For the Admin system role: refuse to change permissions (it has every
  // permission by definition; tampering would brick the owner).
  if (existing.is_system && existing.name === "Admin") {
    return {
      ok: false,
      error: "The Admin role always has every permission and can't be edited.",
    };
  }

  const trimmed = name.trim();
  const updates: Record<string, unknown> = {
    description: description.trim() || null,
  };
  // Only allow renaming non-system roles.
  if (!existing.is_system) updates.name = trimmed || existing.name;

  const { error: updErr } = await supabase
    .from("roles")
    .update(updates)
    .eq("id", roleId);
  if (updErr) return { ok: false, error: updErr.message };

  // Rewrite grants — simplest correct approach.
  await supabase.from("role_permissions").delete().eq("role_id", roleId);
  if (permissionKeys.length > 0) {
    const { error: grantErr } = await supabase.from("role_permissions").insert(
      permissionKeys.map((k) => ({ role_id: roleId, permission_key: k }))
    );
    if (grantErr) return { ok: false, error: grantErr.message };
  }

  revalidatePath("/app/settings/roles");
  return { ok: true };
}

export async function deleteRole(
  roleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const { data: existing } = await supabase
    .from("roles")
    .select("id, is_system, name")
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .single();
  if (!existing) return { ok: false, error: "Role not found" };
  if (existing.is_system) {
    return { ok: false, error: "System roles (Admin / Manager) can't be deleted." };
  }

  // Block delete if anyone still has this role assigned.
  const { count } = await supabase
    .from("tenant_members")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} team member${count === 1 ? "" : "s"} still has this role — reassign them first.`,
    };
  }

  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/roles");
  return { ok: true };
}
