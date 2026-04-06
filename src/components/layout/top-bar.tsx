'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, Menu, Check } from 'lucide-react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface Branch {
  id: string;
  name: string;
}

interface TopBarProps {
  breadcrumbs: Breadcrumb[];
  branches?: Branch[];
  currentBranchId?: string;
  userName?: string;
  onBranchChange?: (branchId: string) => void;
  onMenuToggle?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TopBar({
  breadcrumbs,
  branches,
  currentBranchId,
  userName = 'User',
  onBranchChange,
  onMenuToggle,
}: TopBarProps) {
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const currentBranch = branches?.find((b) => b.id === currentBranchId);

  return (
    <header className="flex items-center justify-between h-14 px-4 md:px-6 bg-white border-b border-gray-200 shrink-0">
      {/* Left: mobile menu + breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumbs */}
        <nav className="hidden sm:flex items-center gap-1 text-sm min-w-0">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1 min-w-0">
              {idx > 0 && (
                <ChevronRight size={14} className="text-gray-400 shrink-0" />
              )}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-gray-500 hover:text-gray-900 transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-900 font-medium truncate">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Mobile: show only last breadcrumb */}
        <span className="sm:hidden text-sm font-medium text-gray-900 truncate">
          {breadcrumbs[breadcrumbs.length - 1]?.label}
        </span>
      </div>

      {/* Right: branch switcher + avatar */}
      <div className="flex items-center gap-3">
        {/* Branch switcher */}
        {branches && branches.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
              className="flex items-center gap-2 h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="truncate max-w-[140px]">
                {currentBranch?.name ?? 'Select branch'}
              </span>
              <ChevronDown size={14} className="text-gray-400 shrink-0" />
            </button>

            {branchDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setBranchDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      onClick={() => {
                        onBranchChange?.(branch.id);
                        setBranchDropdownOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors',
                        branch.id === currentBranchId && 'text-orange-600 font-medium'
                      )}
                    >
                      {branch.id === currentBranchId && (
                        <Check size={14} className="shrink-0" />
                      )}
                      <span className={cn(branch.id !== currentBranchId && 'pl-[22px]', 'truncate')}>
                        {branch.name}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* User avatar */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-semibold text-white shrink-0">
          {getInitials(userName)}
        </div>
      </div>
    </header>
  );
}
