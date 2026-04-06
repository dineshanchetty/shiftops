"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth, type UserRole } from "@/lib/auth-context";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

function DefaultFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="rounded-full bg-red-100 p-4">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
      <p className="text-gray-600 text-center max-w-md">
        You don&apos;t have permission to access this page. Contact your
        account owner if you believe this is a mistake.
      </p>
      <Link
        href="/app"
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-base-600 px-4 py-2 text-sm font-medium text-white hover:bg-base-700 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-base-600" />
    </div>
  );
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return fallback ?? <DefaultFallback />;
  }

  return <>{children}</>;
}
