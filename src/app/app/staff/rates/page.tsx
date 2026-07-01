import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { listStaffRates } from "./actions";
import { BulkRatesPanel } from "./bulk-rates-panel";

export const dynamic = "force-dynamic";

export default async function StaffRatesPage() {
  const result = await listStaffRates();

  if (!result.ok) {
    // No permission (or error) → bounce to staff list.
    redirect("/app/staff?error=rates-admin-only");
  }

  return (
    <PageShell
      title="Bulk Rate Update"
      subtitle="Set hourly rates for many staff at once. Pick an effective date, enter each new rate (or apply one rate to everyone), then save."
    >
      <BulkRatesPanel rows={result.rows} />
    </PageShell>
  );
}
