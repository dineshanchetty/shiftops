'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  Receipt,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Upload,
} from 'lucide-react';

interface SidebarProps {
  activePath: string;
  tenantName: string;
  userName: string;
  planName: string;
  tenantLogoUrl?: string | null;
}

const navGroups = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', href: '/app', icon: LayoutDashboard },
      { label: 'Roster', href: '/app/roster', icon: Calendar },
      { label: 'Cashup', href: '/app/cashup', icon: Receipt },
      { label: 'Aura Upload', href: '/app/aura-upload', icon: Upload },
    ],
  },
  {
    label: 'Staff',
    items: [
      { label: 'Staff', href: '/app/staff', icon: Users },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Reports', href: '/app/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/app/settings', icon: Settings },
    ],
  },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Sidebar({
  activePath,
  tenantName,
  userName,
  planName,
  tenantLogoUrl,
}: SidebarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    // POST to logout API route, then redirect
    await fetch('/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 bg-gray-900 text-white h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
        {tenantLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenantLogoUrl}
            alt={tenantName}
            className="h-8 w-8 rounded object-cover"
          />
        ) : null}
        <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display, "Sora", sans-serif)' }}>
          ShiftOps
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-5 mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/app'
                    ? activePath === '/app'
                    : activePath.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-5 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-l-[3px] border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-white pl-[17px]'
                          : 'border-l-[3px] border-transparent text-gray-400 hover:text-white hover:bg-white/5 pl-[17px]'
                      )}
                    >
                      <item.icon size={20} className="shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-4 space-y-3">
        {/* Tenant info */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{tenantName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase">
            {planName}
          </span>
        </div>

        {/* User + logout */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white shrink-0">
            {getInitials(userName)}
          </div>
          <p className="text-sm text-gray-300 truncate flex-1">{userName}</p>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-white transition-colors"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
