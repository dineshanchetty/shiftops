import { type ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, subtitle, action, children }: PageShellProps) {
  return (
    <div className="max-w-[1280px] mx-auto w-full">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-lg font-semibold text-gray-900"
            style={{ fontFamily: 'var(--font-display, "Sora", sans-serif)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
