"use client";

/**
 * Client-side gate for permissioned report pages. Wrap a report page's JSX:
 *
 *   <ReportPermissionGate permission="reports.payroll">
 *     <ReportWrapper ...>...</ReportWrapper>
 *   </ReportPermissionGate>
 *
 * Renders nothing while auth context loads (avoids a lock-flash for users who
 * DO have access), then either the report or a lock notice. This is a UX
 * gate — hiding cards on the index handles discovery, and any data these
 * reports pull is already tenant/branch-scoped by RLS.
 */

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Lock } from "lucide-react";

export function ReportPermissionGate({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { hasPermission, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!hasPermission(permission)) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-xl border border-base-200 bg-surface p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-100 text-base-500">
          <Lock size={22} />
        </div>
        <h2 className="text-base font-semibold text-base-900 mb-1">
          Restricted report
        </h2>
        <p className="text-sm text-base-500">
          Your role doesn&apos;t have access to payroll reports. Ask an Admin to
          grant it under Settings → Roles &amp; Permissions.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
