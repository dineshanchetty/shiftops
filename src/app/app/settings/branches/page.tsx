"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronRight } from "lucide-react";
import type { Branch, Brand } from "@/lib/types";

type BranchWithBrand = Branch & { brands: Pick<Brand, "name"> | null };

export default function BranchesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [branches, setBranches] = useState<BranchWithBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Get user role
      const { data: roleData } = await supabase.rpc("get_user_role");
      setUserRole(roleData ?? null);

      // Get tenant id
      const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
      if (!tenantId) return;

      const { data } = await supabase
        .from("branches")
        .select("*, brands(name)")
        .eq("tenant_id", tenantId)
        .order("name");

      setBranches((data as BranchWithBrand[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const isOwner = userRole === "owner";

  return (
    <PageShell
      title="Branches"
      subtitle="Manage your branch locations and Aura POS connections."
      action={
        isOwner ? (
          <Button size="sm" onClick={() => router.push("/app/settings/branches/new")}>
            <Plus size={16} />
            Add Branch
          </Button>
        ) : undefined
      }
    >
      <div className="rounded-xl bg-surface shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px_1fr_120px_40px] gap-4 px-6 py-3 border-b border-base-200 text-xs font-medium text-base-400 uppercase tracking-wide">
          <span>Branch Name</span>
          <span>Brand</span>
          <span>Address</span>
          <span>Aura Status</span>
          <span />
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-base-400">
            Loading branches...
          </div>
        ) : branches.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-base-400">
            No branches found. Add your first branch to get started.
          </div>
        ) : (
          branches.map((branch) => {
            const hasAura = !!branch.aura_ftp_host;

            return (
              <button
                key={branch.id}
                onClick={() =>
                  router.push(`/app/settings/branches/${branch.id}`)
                }
                className="grid grid-cols-[1fr_140px_1fr_120px_40px] gap-4 px-6 py-4 items-center border-b border-base-100 last:border-0 w-full text-left hover:bg-surface-2 transition-colors"
              >
                <span className="text-sm font-medium text-base-900 truncate">
                  {branch.name}
                </span>
                <span className="text-sm text-base-600 truncate">
                  {branch.brands?.name ?? "—"}
                </span>
                <span className="text-sm text-base-500 truncate">
                  {branch.address || "—"}
                </span>
                <span>
                  {hasAura ? (
                    <Badge variant="success">Connected</Badge>
                  ) : (
                    <Badge variant="default">Not configured</Badge>
                  )}
                </span>
                <ChevronRight
                  size={16}
                  className="text-base-400 justify-self-end"
                />
              </button>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
