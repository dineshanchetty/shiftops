import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/server";
import { listTeamMembers } from "./actions";
import { listRoles } from "../roles/actions";
import { TeamPanel } from "./team-panel";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const [result, rolesResult] = await Promise.all([
    listTeamMembers(),
    listRoles(),
  ]);
  const supabase = await createClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .order("name");

  const availableRoles = rolesResult.ok
    ? rolesResult.roles.map((r) => ({ id: r.id, name: r.name, is_system: r.is_system }))
    : [];

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
      subtitle="Invite people and control their access. Admins have full control; Managers can input data only and only see the branches you grant them."
    >
      {result.serviceUnavailable && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Adding new users is disabled.</strong> Set{" "}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          in your Azure Static Web App environment variables (copy it from
          Supabase Dashboard → Project Settings → API → <code className="font-mono text-xs bg-amber-100 px-1 rounded">service_role</code>).
          Until then you can see members and change roles, but you can&apos;t add new users or
          look up emails.
        </div>
      )}
      <TeamPanel
        initialMembers={result.members}
        branches={(branches ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
        availableRoles={availableRoles}
      />
    </PageShell>
  );
}
