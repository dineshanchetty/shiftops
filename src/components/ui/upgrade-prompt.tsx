"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PLANS, type PlanKey } from "@/lib/plan-limits";

interface UpgradePromptProps {
  resource: "branches" | "users";
  currentPlan: string;
  limit: number;
}

export function UpgradePrompt({
  resource,
  currentPlan,
  limit,
}: UpgradePromptProps) {
  const planName = PLANS[currentPlan as PlanKey]?.name ?? currentPlan;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">
          You&apos;ve reached your {resource} limit on the {planName} plan
          ({limit} {resource}). Upgrade to add more.
        </p>
        <Link
          href="/app/settings/billing"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 h-8 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
        >
          Upgrade Now
        </Link>
      </div>
    </div>
  );
}
