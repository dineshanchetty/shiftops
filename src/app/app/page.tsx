'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import {
  Building2,
  Receipt,
  AlertTriangle,
  TrendingUp,
  Users,
  Calendar,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchRow {
  id: string;
  name: string;
}

interface CashupRow {
  id: string;
  date: string;
  gross_turnover: number | null;
  status: string | null;
  branch_id: string;
  branches: { name: string } | null;
}

interface RosterRow {
  id: string;
  date: string;
  shift_start: string | null;
  shift_end: string | null;
  shift_hours: number | null;
  is_off: boolean | null;
  staff: { first_name: string; last_name: string } | null;
  positions: { name: string } | null;
}

interface BranchOverview {
  id: string;
  name: string;
  todayStatus: 'submitted' | 'draft' | 'missing';
  weekTurnover: number;
}

interface DashboardData {
  totalBranches: number;
  todaysCashups: number;
  missingCashups: number;
  monthlyTurnover: number;
  lastMonthTurnover: number;
  todaysRoster: RosterRow[];
  upcomingRoster: { date: string; entries: RosterRow[] }[];
  recentCashups: CashupRow[];
  branchOverviews: BranchOverview[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];
  return { start, end };
}

function getLastMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
    .toISOString()
    .split('T')[0];
  return { start, end };
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday start
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

function turnoverDelta(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-gray-200 ${className ?? ''}`}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const supabase = createClient();

        // Get tenant id for current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: member } = await supabase
          .from('tenant_members')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (!member) return;
        const tenantId = member.tenant_id;

        const today = getToday();
        const { start: monthStart, end: monthEnd } = getMonthRange();
        const { start: lastMonthStart, end: lastMonthEnd } =
          getLastMonthRange();
        const { start: weekStart, end: weekEnd } = getWeekRange();

        // Run all queries in parallel
        const [
          branchesRes,
          todayCashupsRes,
          monthCashupsRes,
          lastMonthCashupsRes,
          rosterRes,
          recentCashupsRes,
          weekCashupsRes,
          todayAllCashupsRes,
          upcomingRosterRes,
        ] = await Promise.all([
          // 1. Branches
          supabase
            .from('branches')
            .select('id, name')
            .eq('tenant_id', tenantId),

          // 2. Today's submitted cashups
          supabase
            .from('daily_cashups')
            .select('id, branch_id, status')
            .eq('tenant_id', tenantId)
            .eq('date', today)
            .eq('status', 'submitted'),

          // 3. This month's cashups (for turnover sum)
          supabase
            .from('daily_cashups')
            .select('gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', monthStart)
            .lte('date', monthEnd),

          // 4. Last month's cashups (for delta comparison)
          supabase
            .from('daily_cashups')
            .select('gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', lastMonthStart)
            .lte('date', lastMonthEnd),

          // 5. Today's roster with staff + position
          supabase
            .from('roster_entries')
            .select(`
              id, date, shift_start, shift_end, shift_hours, is_off,
              staff!inner(first_name, last_name, position_id, positions(name))
            `)
            .eq('tenant_id', tenantId)
            .eq('date', today)
            .eq('is_off', false),

          // 6. Recent cashups (last 7)
          supabase
            .from('daily_cashups')
            .select('id, date, gross_turnover, status, branch_id, branches(name)')
            .eq('tenant_id', tenantId)
            .order('date', { ascending: false })
            .limit(7),

          // 7. This week's cashups per branch (for branch overview)
          supabase
            .from('daily_cashups')
            .select('branch_id, gross_turnover, date, status')
            .eq('tenant_id', tenantId)
            .gte('date', weekStart)
            .lte('date', weekEnd),

          // 8. Today's cashups (all statuses) for branch overview
          supabase
            .from('daily_cashups')
            .select('branch_id, status')
            .eq('tenant_id', tenantId)
            .eq('date', today),

          // 9. Upcoming roster (next 3 days)
          supabase
            .from('roster_entries')
            .select(`
              id, date, shift_start, shift_end, shift_hours, is_off,
              staff!inner(first_name, last_name, position_id, positions(name))
            `)
            .eq('tenant_id', tenantId)
            .gt('date', today)
            .lte('date', new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0])
            .order('date')
            .order('shift_start'),
        ]);

        // ─── Process data ───────────────────────────────────────────────

        const branches: BranchRow[] = branchesRes.data ?? [];
        const totalBranches = branches.length;
        const todaysCashups = (todayCashupsRes.data ?? []).length;
        const missingCashups = totalBranches - todaysCashups;

        const monthlyTurnover = (monthCashupsRes.data ?? []).reduce(
          (sum, c) => sum + (c.gross_turnover ?? 0),
          0
        );
        const lastMonthTurnover = (lastMonthCashupsRes.data ?? []).reduce(
          (sum, c) => sum + (c.gross_turnover ?? 0),
          0
        );

        // Build roster entries with position names
        const todaysRoster: RosterRow[] = (rosterRes.data ?? []).map(
          (entry: Record<string, unknown>) => {
            const staff = entry.staff as Record<string, unknown> | null;
            const positions = staff?.positions as { name: string } | null;
            return {
              id: entry.id as string,
              date: entry.date as string,
              shift_start: entry.shift_start as string | null,
              shift_end: entry.shift_end as string | null,
              shift_hours: entry.shift_hours as number | null,
              is_off: entry.is_off as boolean | null,
              staff: staff
                ? {
                    first_name: staff.first_name as string,
                    last_name: staff.last_name as string,
                  }
                : null,
              positions: positions ?? null,
            };
          }
        );

        // Build recent cashups
        const recentCashups: CashupRow[] = (recentCashupsRes.data ?? []).map(
          (c: Record<string, unknown>) => ({
            id: c.id as string,
            date: c.date as string,
            gross_turnover: c.gross_turnover as number | null,
            status: c.status as string | null,
            branch_id: c.branch_id as string,
            branches: c.branches as { name: string } | null,
          })
        );

        // Build branch overview
        const todayCashupMap = new Map<string, string>();
        (todayAllCashupsRes.data ?? []).forEach(
          (c: { branch_id: string; status: string | null }) => {
            todayCashupMap.set(c.branch_id, c.status ?? 'draft');
          }
        );

        const weekCashups = weekCashupsRes.data ?? [];
        const weekTurnoverMap = new Map<string, number>();
        (weekCashups as { branch_id: string; gross_turnover: number | null }[]).forEach((c) => {
          const prev = weekTurnoverMap.get(c.branch_id) ?? 0;
          weekTurnoverMap.set(c.branch_id, prev + (c.gross_turnover ?? 0));
        });

        const branchOverviews: BranchOverview[] = branches.map((b) => ({
          id: b.id,
          name: b.name,
          todayStatus: (todayCashupMap.get(b.id) as 'submitted' | 'draft') ?? 'missing',
          weekTurnover: weekTurnoverMap.get(b.id) ?? 0,
        }));

        // Build upcoming roster grouped by date
        const upcomingRaw: RosterRow[] = (upcomingRosterRes.data ?? []).map(
          (entry: Record<string, unknown>) => {
            const staff = entry.staff as Record<string, unknown> | null;
            const positions = staff?.positions as { name: string } | null;
            return {
              id: entry.id as string,
              date: entry.date as string,
              shift_start: entry.shift_start as string | null,
              shift_end: entry.shift_end as string | null,
              shift_hours: entry.shift_hours as number | null,
              is_off: entry.is_off as boolean | null,
              staff: staff ? { first_name: staff.first_name as string, last_name: staff.last_name as string } : null,
              positions: positions ?? null,
            };
          }
        );
        const upcomingByDate = new Map<string, RosterRow[]>();
        upcomingRaw.forEach((r) => {
          const list = upcomingByDate.get(r.date) ?? [];
          list.push(r);
          upcomingByDate.set(r.date, list);
        });
        const upcomingRoster = Array.from(upcomingByDate.entries())
          .map(([date, entries]) => ({ date, entries }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setData({
          totalBranches,
          todaysCashups,
          missingCashups,
          monthlyTurnover,
          lastMonthTurnover,
          todaysRoster,
          upcomingRoster,
          recentCashups,
          branchOverviews,
        });
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell title="Dashboard" subtitle="Overview of your franchise operations">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <SkeletonBlock key={i} className="h-[120px]" />
          ))}
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-[200px]" />
          <SkeletonBlock className="h-[300px]" />
          <SkeletonBlock className="h-[160px]" />
        </div>
      </PageShell>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <PageShell title="Dashboard" subtitle="Overview of your franchise operations">
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardContent>
            <p className="text-sm text-red-600">
              {error ?? 'Unable to load dashboard data. Please try refreshing.'}
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ─── Computed values ────────────────────────────────────────────────────────

  const delta = turnoverDelta(data.monthlyTurnover, data.lastMonthTurnover);
  const today = getToday();

  return (
    <PageShell title="Dashboard" subtitle="Overview of your franchise operations">
      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Branches"
          value={data.totalBranches}
          icon={<Building2 size={20} />}
        />
        <StatCard
          label="Today's Cashups"
          value={`${data.todaysCashups} of ${data.totalBranches}`}
          icon={<Receipt size={20} />}
        />
        <StatCard
          label="Missing Cashups"
          value={data.missingCashups}
          icon={<AlertTriangle size={20} />}
        />
        <StatCard
          label="Monthly Turnover"
          value={formatCurrency(data.monthlyTurnover)}
          delta={delta}
          icon={<TrendingUp size={20} />}
        />
      </div>

      <div className="space-y-6">
        {/* ── Today's Roster ──────────────────────────────────────────── */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar size={18} className="text-accent" />
                Today&apos;s Roster &mdash; {formatDate(today)}
              </CardTitle>
              <span className="text-sm text-base-400 flex items-center gap-1">
                <Users size={14} />
                {data.todaysRoster.length} staff on shift today
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {data.todaysRoster.length === 0 ? (
              <p className="text-sm text-base-400 py-4 text-center">
                No shifts scheduled for today
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Staff Name
                      </th>
                      <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Position
                      </th>
                      <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Shift Time
                      </th>
                      <th className="text-right py-2 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.todaysRoster.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="py-2.5 pr-4 text-base-900 font-medium">
                          {entry.staff
                            ? `${entry.staff.first_name} ${entry.staff.last_name}`
                            : '\u2014'}
                        </td>
                        <td className="py-2.5 pr-4 text-base-500">
                          {entry.positions?.name ?? '\u2014'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-base-700">
                          {entry.shift_start && entry.shift_end
                            ? `${formatTime(entry.shift_start)} \u2013 ${formatTime(entry.shift_end)}`
                            : '\u2014'}
                        </td>
                        <td className="py-2.5 text-right font-mono text-base-700">
                          {entry.shift_hours != null
                            ? `${entry.shift_hours}h`
                            : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Upcoming Roster ────────────────────────────────────────── */}
        {data.upcomingRoster.length > 0 && (
          <Card className="hover:translate-y-0 hover:shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar size={18} className="text-accent" />
                  Upcoming Roster
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.upcomingRoster.map((day) => (
                  <div key={day.date}>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                      <span>{formatDate(day.date)}</span>
                      <span className="text-xs font-normal text-gray-400">{day.entries.filter(e => !e.is_off).length} staff</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {day.entries.filter(e => !e.is_off).map((entry) => (
                        <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                          <span className="font-medium text-gray-900">
                            {entry.staff?.first_name} {entry.staff?.last_name?.charAt(0)}.
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-xs text-gray-500">{entry.positions?.name}</span>
                          <span className="ml-auto font-mono text-xs text-gray-500">
                            {entry.shift_start ? formatTime(entry.shift_start) : '--'}–{entry.shift_end ? formatTime(entry.shift_end) : '--'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Recent Cashups ─────────────────────────────────────────── */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt size={18} className="text-accent" />
              Recent Cashups
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentCashups.length === 0 ? (
              <p className="text-sm text-base-400 py-4 text-center">
                No cashups recorded yet
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Date
                      </th>
                      <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Branch
                      </th>
                      <th className="text-right py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Gross Turnover
                      </th>
                      <th className="text-right py-2 font-medium text-base-400 uppercase tracking-wide text-xs">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentCashups.map((cashup) => (
                      <tr
                        key={cashup.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="py-2.5 pr-4 text-base-700">
                          {formatDate(cashup.date)}
                        </td>
                        <td className="py-2.5 pr-4 text-base-900 font-medium">
                          {cashup.branches?.name ?? '\u2014'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-base-900">
                          {cashup.gross_turnover != null
                            ? formatCurrency(cashup.gross_turnover)
                            : '\u2014'}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            variant={
                              cashup.status === 'submitted'
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {cashup.status === 'submitted'
                              ? 'Submitted'
                              : 'Draft'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Branch Overview ────────────────────────────────────────── */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 size={18} className="text-accent" />
              Branch Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.branchOverviews.length === 0 ? (
              <p className="text-sm text-base-400 py-4 text-center">
                No branches configured
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.branchOverviews.map((branch) => (
                  <div
                    key={branch.id}
                    className="rounded-lg border border-gray-100 bg-gray-50/50 p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-semibold text-base-900 text-sm">
                        {branch.name}
                      </h4>
                      <Badge
                        variant={
                          branch.todayStatus === 'submitted'
                            ? 'success'
                            : branch.todayStatus === 'draft'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {branch.todayStatus === 'submitted'
                          ? 'Submitted'
                          : branch.todayStatus === 'draft'
                            ? 'Draft'
                            : 'Missing'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-xs text-base-400 uppercase tracking-wide">
                        This week
                      </span>
                      <p className="text-lg font-bold font-mono text-base-900">
                        {formatCurrency(branch.weekTurnover)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
