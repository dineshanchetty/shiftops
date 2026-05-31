import { PageShell } from "@/components/layout/page-shell";
import { listTeamMembers } from "./actions";
import { TeamPanel } from "./team-panel";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const result = await listTeamMembers();

  if (!result.ok) {
    return (
      <PageShell title="Team" subtitle="Manage who can access ShiftOps.">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Team"
      subtitle="Invite people and control their access. Admins have full control; Managers can input data only."
    >
      {result.serviceUnavailable && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Email invites are disabled.</strong> Set{" "}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          in your Azure Static Web App configuration (Supabase Dashboard → Project Settings → API
          → service_role). Until then you can see members + change roles, but new invites and
          email lookups won&apos;t work.
        </div>
      )}
      <TeamPanel initialMembers={result.members} />
    </PageShell>
  );
}
