import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { listStaffRates } from "./actions";
import { BulkRatesPanel } from "./bulk-rates-panel";

export const dynamic = "force-dynamic";

export default async function StaffRatesPage() {
  const result = await listStaffRates();

  if (!result.ok) {
    // Show the reason inline instead of silently bouncing — makes permission
    // vs. data errors distinguishable.
    return (
      <PageShell title="Bulk Rate Update">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {result.error}
          <div className="mt-2">
            <Link href="/app/staff" className="text-accent hover:underline">
              ← Back to Staff
            </Link>
          </div>
        </div>
      </PageShell>
    );
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
