import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { BottomTabs } from '@/components/layout/bottom-tabs';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch tenant info for the current user
  const { data: tenantMember } = await supabase
    .from('tenant_members')
    .select('role, tenant:tenants(id, name, plan, logo_url)')
    .eq('user_id', user.id)
    .single();

  const tenant = (tenantMember?.tenant as { id: string; name: string; plan: string; logo_url: string | null } | null);
  const tenantName = tenant?.name ?? 'My Organization';
  const planName = tenant?.plan ?? 'free';
  const tenantLogoUrl = tenant?.logo_url ?? null;

  // Get user display name from metadata
  const userName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email ??
    'User';

  // Fetch branches for the tenant
  const { data: branches } = tenant
    ? await supabase
        .from('branches')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .order('name')
    : { data: [] };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - hidden on mobile */}
      <Sidebar
        activePath="/app"
        tenantName={tenantName}
        userName={userName}
        planName={planName}
        tenantLogoUrl={tenantLogoUrl}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          breadcrumbs={[{ label: tenantName }]}
          branches={branches ?? []}
          userName={userName}
        />

        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 pb-20 md:p-6 lg:p-8 md:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom tabs - mobile only */}
      <BottomTabs activePath="/app" />
    </div>
  );
}
