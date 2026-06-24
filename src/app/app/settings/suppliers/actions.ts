"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

export async function createSupplier(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requirePermission("settings.suppliers");
  if (!guard.ok) return guard;

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Supplier name is required." };

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const { error } = await supabase
    .from("suppliers")
    .insert({ tenant_id: tenantId, name: trimmed });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `"${trimmed}" already exists.` };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/app/settings/suppliers");
  return { ok: true };
}

export async function renameSupplier(
  id: string,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requirePermission("settings.suppliers");
  if (!guard.ok) return guard;

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Supplier name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/suppliers");
  return { ok: true };
}

export async function setSupplierActive(
  id: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requirePermission("settings.suppliers");
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/suppliers");
  return { ok: true };
}
