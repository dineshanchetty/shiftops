// ─── Plan configuration & enforcement ─────────────────────────────────────────

export type PlanKey = "trial" | "starter" | "growth" | "enterprise";

export interface PlanConfig {
  name: string;
  branches: number;
  users: number;
  price: number;
  features: string[];
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  trial: {
    name: "Free Trial",
    branches: 1,
    users: 3,
    price: 0,
    features: ["1 Branch", "3 Managers", "14-day trial"],
  },
  starter: {
    name: "Starter",
    branches: 1,
    users: 3,
    price: 499,
    features: ["1 Branch", "3 Managers", "Email support"],
  },
  growth: {
    name: "Growth",
    branches: 5,
    users: 999,
    price: 1499,
    features: [
      "Up to 5 Branches",
      "Unlimited Users",
      "Priority support",
      "CSV exports",
    ],
  },
  enterprise: {
    name: "Enterprise",
    branches: 999,
    users: 999,
    price: 3999,
    features: [
      "Unlimited Branches",
      "Unlimited Users",
      "White-label",
      "Dedicated support",
      "API access",
    ],
  },
};

/**
 * Check whether a plan allows adding another resource.
 */
export function checkPlanLimit(
  plan: string,
  resource: "branches" | "users",
  currentCount: number
): { allowed: boolean; limit: number; remaining: number } {
  const config = PLANS[plan as PlanKey];
  if (!config) {
    return { allowed: false, limit: 0, remaining: 0 };
  }
  const limit = config[resource];
  const remaining = Math.max(0, limit - currentCount);
  return { allowed: currentCount < limit, limit, remaining };
}

/**
 * Return the feature list for a plan.
 */
export function getPlanFeatures(plan: string): string[] {
  const config = PLANS[plan as PlanKey];
  return config?.features ?? [];
}
