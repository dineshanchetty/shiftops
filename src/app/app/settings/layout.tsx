import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Settings is owner-only ("Admin Rights"). Managers don't get backend control:
 * branches, brands, billing, account, aura-mapping. Any manager who follows a
 * URL into /app/settings/* bounces back to the dashboard.
 *
 * Defense in depth — the sidebar already hides Settings for managers, and RLS
 * (migration 015_rbac_lock.sql) is the final gate on the underlying tables.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Gated by the settings.access permission — owners always pass, and any
  // custom role granted this permission also gets in.
  const { data: allowed } = await supabase.rpc("has_permission", {
    p_key: "settings.access",
  });
  if (allowed !== true) {
    redirect("/app?settings=admin-only");
  }

  return <>{children}</>;
}
