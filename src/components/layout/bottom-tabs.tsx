'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  Receipt,
  MoreHorizontal,
} from 'lucide-react';

interface BottomTabsProps {
  activePath: string;
}

const tabs = [
  { label: 'Home', href: '/app', icon: LayoutDashboard },
  { label: 'Roster', href: '/app/roster', icon: Calendar },
  { label: 'Cashup', href: '/app/cashup', icon: Receipt },
  { label: 'More', href: '/app/more', icon: MoreHorizontal },
];

export function BottomTabs({ activePath }: BottomTabsProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200">
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/app'
              ? activePath === '/app'
              : activePath.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] transition-colors',
                isActive
                  ? 'text-orange-500'
                  : 'text-gray-400 active:text-gray-600'
              )}
            >
              <tab.icon size={20} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area spacer for devices with home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
