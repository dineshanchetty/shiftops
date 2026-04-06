"use client";

import { useState, useEffect, useCallback } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";
import { PLANS, type PlanKey } from "@/lib/plan-limits";
import { getCurrentPlan, updatePlan, type CurrentPlan } from "./actions";
import {
  Check,
  AlertTriangle,
  ArrowLeft,
  CreditCard,
} from "lucide-react";
import Link from "next/link";

const PLAN_ORDER: PlanKey[] = ["starter", "growth", "enterprise"];

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function BillingPage() {
  const [planInfo, setPlanInfo] = useState<CurrentPlan | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<PlanKey | null>(null);
  const [showConfirm, setShowConfirm] = useState<PlanKey | null>(null);

  const fetchPlan = useCallback(async () => {
    const supabase = createClient();
    const { data: tid } = await supabase.rpc("get_user_tenant_id");
    if (!tid) return;
    setTenantId(tid);

    const info = await getCurrentPlan(tid);
    setPlanInfo(info);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  async function handlePlanChange(newPlan: PlanKey) {
    if (!tenantId) return;
    setUpdating(newPlan);
    const result = await updatePlan(tenantId, newPlan);
    if (result.success) {
      await fetchPlan();
    }
    setUpdating(null);
    setShowConfirm(null);
  }

  if (loading || !planInfo) {
    return (
      <PageShell title="Billing & Plan">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  const trialDays =
    planInfo.plan === "trial" && planInfo.trialEndsAt
      ? daysUntil(planInfo.trialEndsAt)
      : null;

  return (
    <PageShell
      title="Billing & Plan"
      subtitle="Manage your subscription and view usage"
      action={
        <Link
          href="/app/settings"
          className="inline-flex items-center gap-1.5 text-sm text-base-500 hover:text-base-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Settings
        </Link>
      }
    >
      {/* Trial Banner */}
      {trialDays !== null && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {trialDays > 0
                ? `${trialDays} day${trialDays === 1 ? "" : "s"} remaining on your free trial`
                : "Your free trial has expired"}
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Upgrade now to keep access to all your data and features.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              document
                .getElementById("pricing")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Upgrade
          </Button>
        </div>
      )}

      {/* Current Plan + Usage */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {/* Current Plan Card */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-xs text-base-400 uppercase tracking-wider font-medium">
                Current Plan
              </p>
              <p className="text-lg font-semibold text-base-900 font-display">
                {planInfo.planName}
              </p>
            </div>
          </div>
          <p className="text-2xl font-bold text-base-900 mb-1">
            {planInfo.price === 0
              ? "Free"
              : `${formatCurrency(planInfo.price)}/mo`}
          </p>
          <ul className="mt-3 space-y-1.5">
            {planInfo.features.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 text-sm text-base-600"
              >
                <Check size={14} className="text-green-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </Card>

        {/* Usage Card */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <p className="text-xs text-base-400 uppercase tracking-wider font-medium mb-4">
            Usage
          </p>
          <div className="space-y-4">
            {/* Branches */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-base-700">Branches</span>
                <span className="font-medium text-base-900">
                  {planInfo.branchCount} / {planInfo.branchLimit >= 999 ? "\u221e" : planInfo.branchLimit}
                </span>
              </div>
              <div className="h-2 rounded-full bg-base-200 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    planInfo.branchCount >= planInfo.branchLimit
                      ? "bg-red-500"
                      : "bg-accent"
                  )}
                  style={{
                    width: `${Math.min(
                      100,
                      (planInfo.branchCount / Math.max(planInfo.branchLimit, 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Users */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-base-700">Users</span>
                <span className="font-medium text-base-900">
                  {planInfo.userCount} / {planInfo.userLimit >= 999 ? "\u221e" : planInfo.userLimit}
                </span>
              </div>
              <div className="h-2 rounded-full bg-base-200 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    planInfo.userCount >= planInfo.userLimit
                      ? "bg-red-500"
                      : "bg-accent"
                  )}
                  style={{
                    width: `${Math.min(
                      100,
                      (planInfo.userCount / Math.max(planInfo.userLimit, 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Pricing Table */}
      <div id="pricing">
        <h2 className="text-base font-semibold text-base-900 font-display mb-4">
          Plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isCurrent = planInfo.plan === key;
            const currentIdx = PLAN_ORDER.indexOf(planInfo.plan as PlanKey);
            const thisIdx = PLAN_ORDER.indexOf(key);
            const isUpgrade = thisIdx > currentIdx || planInfo.plan === "trial";
            const isDowngrade = thisIdx < currentIdx && planInfo.plan !== "trial";

            return (
              <div
                key={key}
                className={cn(
                  "rounded-xl border p-5 flex flex-col",
                  isCurrent
                    ? "border-accent bg-accent/5 ring-2 ring-accent/20"
                    : "border-base-200 bg-surface"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-base-900 font-display">
                    {plan.name}
                  </h3>
                  {isCurrent && (
                    <Badge variant="info">Current</Badge>
                  )}
                </div>

                <p className="text-2xl font-bold text-base-900 mb-4">
                  {formatCurrency(plan.price)}
                  <span className="text-sm font-normal text-base-400">/mo</span>
                </p>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-base-600"
                    >
                      <Check
                        size={14}
                        className="text-green-500 shrink-0 mt-0.5"
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="secondary" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : showConfirm === key ? (
                  <div className="space-y-2">
                    <p className="text-xs text-base-500 text-center">
                      {isDowngrade
                        ? "Downgrade? Some features may be lost."
                        : `Upgrade to ${plan.name}?`}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setShowConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant={isDowngrade ? "danger" : "primary"}
                        size="sm"
                        className="flex-1"
                        disabled={updating === key}
                        onClick={() => handlePlanChange(key)}
                      >
                        {updating === key ? "Updating..." : "Confirm"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant={isUpgrade ? "primary" : "secondary"}
                    className="w-full"
                    onClick={() => setShowConfirm(key)}
                  >
                    {isUpgrade ? "Upgrade" : "Downgrade"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice History */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-base-900 font-display mb-4">
          Invoice History
        </h2>
        <div className="rounded-xl border border-base-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-200 bg-surface-2 text-left">
                <th className="px-4 py-3 font-medium text-base-600">Date</th>
                <th className="px-4 py-3 font-medium text-base-600">
                  Description
                </th>
                <th className="px-4 py-3 font-medium text-base-600 text-right">
                  Amount
                </th>
                <th className="px-4 py-3 font-medium text-base-600">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-base-400"
                >
                  No invoices yet. Invoices will appear here once PayFast billing
                  is active.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
