import { PageShell } from '@/components/layout/page-shell';
import { StatCard } from '@/components/ui/stat-card';
import {
  Building2,
  Receipt,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

export default function DashboardPage() {
  return (
    <PageShell title="Dashboard" subtitle="Overview of your franchise operations">
      {/* KPI stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Branches"
          value={12}
          delta={2}
          icon={<Building2 size={20} />}
        />
        <StatCard
          label="Today's Cashups"
          value={8}
          delta={-5}
          icon={<Receipt size={20} />}
        />
        <StatCard
          label="Missing Cashups"
          value={4}
          icon={<AlertTriangle size={20} />}
        />
        <StatCard
          label="Monthly Turnover"
          value="R 1.2M"
          delta={12}
          icon={<TrendingUp size={20} />}
        />
      </div>

      {/* Branch Health section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2
          className="text-base font-semibold text-gray-900 mb-4"
          style={{ fontFamily: 'var(--font-display, "Sora", sans-serif)' }}
        >
          Branch Health
        </h2>
        <p className="text-sm text-gray-500">
          Branch health scores and performance indicators will appear here once
          cashup data is available. Each branch will show a health score based on
          cashup completion rate, variance from targets, and operational
          compliance.
        </p>
      </div>
    </PageShell>
  );
}
