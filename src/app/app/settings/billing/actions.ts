"use server";

import { createClient } from "@/lib/supabase/server";
import { PLANS, type PlanKey } from "@/lib/plan-limits";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurrentPlan {
  plan: PlanKey;
  planName: string;
  price: number;
  features: string[];
  trialEndsAt: string | null;
  branchCount: number;
  branchLimit: number;
  userCount: number;
  userLimit: number;
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getCurrentPlan(tenantId: string): Promise<CurrentPlan | null> {
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan, trial_ends_at")
    .eq("id", tenantId)
    .single();

  if (!tenant) return null;

  const plan = (tenant.plan as PlanKey) || "trial";
  const config = PLANS[plan] ?? PLANS.trial;

  const usage = await getUsageCounts(tenantId);

  return {
    plan,
    planName: config.name,
    price: config.price,
    features: config.features,
    trialEndsAt: tenant.trial_ends_at,
    branchCount: usage.branches,
    branchLimit: config.branches,
    userCount: usage.users,
    userLimit: config.users,
  };
}

export async function getUsageCounts(
  tenantId: string
): Promise<{ branches: number; users: number }> {
  const supabase = await createClient();

  const [branchRes, userRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("tenant_members")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  return {
    branches: branchRes.count ?? 0,
    users: userRes.count ?? 0,
  };
}

export async function updatePlan(
  tenantId: string,
  newPlan: PlanKey
): Promise<{ success: boolean; error?: string }> {
  if (!PLANS[newPlan]) {
    return { success: false, error: "Invalid plan." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("tenants")
    .update({ plan: newPlan })
    .eq("id", tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
