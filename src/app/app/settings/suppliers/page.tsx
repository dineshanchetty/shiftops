import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/server";
import { SuppliersPanel, type SupplierRow } from "./suppliers-panel";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const supabase = await createClient();

  // Gate to settings.suppliers (admins). Mirrors the other settings pages.
  const { data: allowed } = await supabase.rpc("has_permission", {
    p_key: "settings.suppliers",
  });
  if (allowed !== true) redirect("/app?settings=admin-only");

  const { data } = await supabase
    .from("suppliers")
    .select("id, name, active")
    .order("name");

  return (
    <PageShell
      title="Suppliers"
      subtitle="Manage the supplier list used on the cashup Purchases tab. Names you add here appear in the dropdown and group the Purchase & Expense report."
    >
      <SuppliersPanel
        initial={(data ?? []).map((s) => ({
          id: s.id as string,
          name: s.name as string,
          active: s.active as boolean,
        })) as SupplierRow[]}
      />
    </PageShell>
  );
}
