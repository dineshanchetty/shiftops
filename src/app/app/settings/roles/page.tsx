import { PageShell } from "@/components/layout/page-shell";
import { listRoles, listPermissions } from "./actions";
import { RolesPanel } from "./roles-panel";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const [rolesResult, permissions] = await Promise.all([
    listRoles(),
    listPermissions(),
  ]);

  if (!rolesResult.ok) {
    return (
      <PageShell title="Roles & Permissions">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {rolesResult.error}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Roles & Permissions"
      subtitle="Define custom roles with their own permission sets. Admins and Managers are built-in. Custom roles can be assigned to team members on the Team page."
    >
      <RolesPanel initialRoles={rolesResult.roles} permissions={permissions} />
    </PageShell>
  );
}
