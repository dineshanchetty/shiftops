"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomTabs } from "@/components/layout/bottom-tabs";

interface AppShellClientProps {
  tenantName: string;
  userName: string;
  planName: string;
  tenantLogoUrl: string | null;
  branches: { id: string; name: string }[];
  children: React.ReactNode;
}

export function AppShellClient({
  tenantName,
  userName,
  planName,
  tenantLogoUrl,
  branches,
  children,
}: AppShellClientProps) {
  const pathname = usePathname();

  return (
    <>
      <Sidebar
        activePath={pathname}
        tenantName={tenantName}
        userName={userName}
        planName={planName}
        tenantLogoUrl={tenantLogoUrl}
      />
      {children}
      <BottomTabs activePath={pathname} />
    </>
  );
}
