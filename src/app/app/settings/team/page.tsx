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
      <TeamPanel initialMembers={result.members} />
    </PageShell>
  );
}
