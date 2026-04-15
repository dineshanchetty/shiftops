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
  Sparkles,
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

interface PredictiveData {
  tomorrowForecast: number | null;
  forecastConfidence: 'high' | 'medium' | 'low';
  recommendedStaff: number | null;
  scheduledTomorrowStaff: number;
  last7DaysTurnover: { date: string; turnover: number }[];
  weekTrend: number | null; // % change vs prior week
  cashFlowAlertDates: string[];
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
  predictive: PredictiveData;
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

function getNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun … 6=Sat
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

        const tomorrow = getTomorrow();
        const days28Ago = getNDaysAgo(28);
        const days7Ago = getNDaysAgo(7);
        const days14Ago = getNDaysAgo(14);

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
          // Predictive queries
          last28CashupsRes,
          tomorrowRosterRes,
          last7CashupsRes,
          priorWeekCashupsRes,
          thisWeekCashupsForAlertRes,
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

          // 10. Last 28 days cashups for same-weekday forecasting
          supabase
            .from('daily_cashups')
            .select('date, gross_turnover, cash_banked, discounts, delivery_charges, credit_cards, debtors')
            .eq('tenant_id', tenantId)
            .gte('date', days28Ago)
            .order('date'),

          // 11. Tomorrow's roster count
          supabase
            .from('roster_entries')
            .select('id, shift_hours')
            .eq('tenant_id', tenantId)
            .eq('date', tomorrow)
            .eq('is_off', false),

          // 12. Last 7 days cashups for sparkline
          supabase
            .from('daily_cashups')
            .select('date, gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', days7Ago)
            .order('date'),

          // 13. Prior 7 days (8-14 days ago) for trend comparison
          supabase
            .from('daily_cashups')
            .select('gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', days14Ago)
            .lt('date', days7Ago),

          // 14. This week's cashups (all) for banking variance alert
          supabase
            .from('daily_cashups')
            .select('date, gross_turnover, discounts, delivery_charges, credit_cards, debtors, cash_banked')
            .eq('tenant_id', tenantId)
            .gte('date', weekStart)
            .lte('date', weekEnd),
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

        // ─── Predictive calculations ────────────────────────────────────

        // Tomorrow's forecast: average same weekday over last 4 occurrences
        const tomorrowDow = getDayOfWeek(tomorrow);
        const last28 = (last28CashupsRes.data ?? []) as { date: string; gross_turnover: number | null }[];
        const sameDowEntries = last28
          .filter((c) => getDayOfWeek(c.date) === tomorrowDow && c.gross_turnover != null)
          .map((c) => c.gross_turnover as number);

        let tomorrowForecast: number | null = null;
        let forecastConfidence: 'high' | 'medium' | 'low' = 'low';
        if (sameDowEntries.length > 0) {
          tomorrowForecast = sameDowEntries.reduce((a, b) => a + b, 0) / sameDowEntries.length;
          forecastConfidence = sameDowEntries.length >= 4 ? 'high' : sameDowEntries.length >= 2 ? 'medium' : 'low';
        }

        // Staffing recommendation: predicted_turnover / avg_turnover_per_staff_hour / avg_shift_hours
        const tomorrowRosterEntries = (tomorrowRosterRes.data ?? []) as { id: string; shift_hours: number | null }[];
        const scheduledTomorrowStaff = tomorrowRosterEntries.length;

        let recommendedStaff: number | null = null;
        if (tomorrowForecast !== null && last28.length > 0) {
          // Compute avg staff per day from last 28 days roster data — simplified: use turnover per staff ratio
          // Use historical ratio: total turnover / total scheduled staff across last 28 days
          const avgTurnoverPerDay = last28
            .filter((c) => c.gross_turnover != null && c.gross_turnover > 0)
            .reduce((sum, c) => sum + (c.gross_turnover ?? 0), 0) / Math.max(1, last28.filter((c) => (c.gross_turnover ?? 0) > 0).length);

          // Simple ratio: staff recommended = (predicted / avg_turnover_per_day) * approx_historic_staff
          const approxHistoricStaff = Math.max(1, scheduledTomorrowStaff || 4);
          const ratio = approxHistoricStaff / Math.max(1, avgTurnoverPerDay);
          recommendedStaff = Math.max(1, Math.round(tomorrowForecast * ratio));
        }

        // Last 7 days turnover sparkline
        const last7Raw = (last7CashupsRes.data ?? []) as { date: string; gross_turnover: number | null }[];
        // Build a map keyed by date
        const last7Map = new Map<string, number>();
        last7Raw.forEach((c) => { if (c.gross_turnover != null) last7Map.set(c.date, c.gross_turnover); });

        // Fill all 7 days (even those with no data)
        const last7DaysTurnover: { date: string; turnover: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const ds = d.toISOString().split('T')[0];
          last7DaysTurnover.push({ date: ds, turnover: last7Map.get(ds) ?? 0 });
        }

        // Week trend: this week vs prior week
        const thisWeekTotal = last7Raw.reduce((sum, c) => sum + (c.gross_turnover ?? 0), 0);
        const priorWeekTotal = ((priorWeekCashupsRes.data ?? []) as { gross_turnover: number | null }[])
          .reduce((sum, c) => sum + (c.gross_turnover ?? 0), 0);
        const weekTrend = priorWeekTotal > 0
          ? Math.round(((thisWeekTotal - priorWeekTotal) / priorWeekTotal) * 100)
          : null;

        // Cash flow alert: banking variance > R50 this week
        const thisWeekForAlert = (thisWeekCashupsForAlertRes.data ?? []) as {
          date: string;
          gross_turnover: number | null;
          discounts: number | null;
          delivery_charges: number | null;
          credit_cards: number | null;
          debtors: number | null;
          cash_banked: number | null;
        }[];
        const cashFlowAlertDates = thisWeekForAlert
          .filter((c) => {
            if (c.cash_banked == null || c.gross_turnover == null) return false;
            const expectedBanking =
              (c.gross_turnover ?? 0) -
              (c.discounts ?? 0) +
              (c.delivery_charges ?? 0) -
              (c.credit_cards ?? 0) -
              (c.debtors ?? 0);
            return Math.abs(expectedBanking - (c.cash_banked ?? 0)) > 50;
          })
          .map((c) => c.date);

        const predictive: PredictiveData = {
          tomorrowForecast,
          forecastConfidence,
          recommendedStaff,
          scheduledTomorrowStaff,
          last7DaysTurnover,
          weekTrend,
          cashFlowAlertDates,
        };

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
          predictive,
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

        {/* ── Predictions & Insights ─────────────────────────────────── */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-accent" />
              Predictions &amp; Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* 1. Tomorrow's Forecast */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-base-400">
                    Tomorrow&apos;s Forecast
                  </span>
                  <Badge
                    variant={
                      data.predictive.forecastConfidence === 'high'
                        ? 'success'
                        : data.predictive.forecastConfidence === 'medium'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {data.predictive.forecastConfidence === 'high'
                      ? 'High confidence'
                      : data.predictive.forecastConfidence === 'medium'
                        ? 'Medium confidence'
                        : 'Low confidence'}
                  </Badge>
                </div>
                {data.predictive.tomorrowForecast != null ? (
                  <p className="text-2xl font-bold font-mono text-base-900">
                    {formatCurrency(Math.round(data.predictive.tomorrowForecast))}
                  </p>
                ) : (
                  <p className="text-sm text-base-400">Not enough historical data</p>
                )}
                <p className="text-xs text-base-400 mt-1">
                  Expected turnover — based on same-weekday avg (last 4 weeks)
                </p>
              </div>

              {/* 2. Staffing Recommendation */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-base-400">
                    Staffing Recommendation
                  </span>
                  {data.predictive.recommendedStaff != null && (
                    <Badge
                      variant={
                        data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                        ? 'Sufficient'
                        : 'Understaffed'}
                    </Badge>
                  )}
                </div>
                {data.predictive.recommendedStaff != null ? (
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-2xl font-bold text-base-900">
                        {data.predictive.recommendedStaff}
                      </p>
                      <p className="text-xs text-base-400">Recommended</p>
                    </div>
                    <div className="text-base-300 text-xl font-light mb-1">vs</div>
                    <div>
                      <p className={`text-2xl font-bold ${
                        data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                          ? 'text-green-600'
                          : 'text-amber-500'
                      }`}>
                        {data.predictive.scheduledTomorrowStaff}
                      </p>
                      <p className="text-xs text-base-400">Scheduled</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-base-400">
                    {data.predictive.scheduledTomorrowStaff} staff scheduled tomorrow
                  </p>
                )}
              </div>

              {/* 3. Weekly Trend Sparkline */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-base-400">
                    7-Day Turnover Trend
                  </span>
                  {data.predictive.weekTrend != null && (
                    <span className={`text-sm font-semibold ${
                      data.predictive.weekTrend >= 0 ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {data.predictive.weekTrend >= 0 ? '↑' : '↓'} {Math.abs(data.predictive.weekTrend)}% vs prev week
                    </span>
                  )}
                </div>
                {/* CSS Sparkline */}
                {(() => {
                  const vals = data.predictive.last7DaysTurnover;
                  const maxVal = Math.max(...vals.map((v) => v.turnover), 1);
                  const isUp = (data.predictive.weekTrend ?? 0) >= 0;
                  return (
                    <div className="flex items-end gap-1 h-14">
                      {vals.map(({ date, turnover }) => {
                        const heightPct = maxVal > 0 ? Math.max(4, (turnover / maxVal) * 100) : 4;
                        return (
                          <div
                            key={date}
                            className="flex-1 flex flex-col items-center gap-1 group relative"
                          >
                            <div
                              className={`w-full rounded-sm transition-all ${isUp ? 'bg-green-400' : 'bg-red-400'}`}
                              style={{ height: `${heightPct}%` }}
                            />
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                              {date.slice(5)}: {turnover > 0 ? formatCurrency(turnover) : '—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-base-300">
                    {data.predictive.last7DaysTurnover[0]?.date.slice(5) ?? ''}
                  </span>
                  <span className="text-[10px] text-base-300">
                    {data.predictive.last7DaysTurnover[6]?.date.slice(5) ?? ''}
                  </span>
                </div>
              </div>

              {/* 4. Cash Flow Alert */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-base-400">
                    Cash Flow Alert
                  </span>
                  <Badge
                    variant={data.predictive.cashFlowAlertDates.length > 0 ? 'danger' : 'success'}
                  >
                    {data.predictive.cashFlowAlertDates.length > 0 ? 'Issues found' : 'All clear'}
                  </Badge>
                </div>
                {data.predictive.cashFlowAlertDates.length === 0 ? (
                  <p className="text-sm text-green-600 font-medium">
                    No banking variances &gt; R50 this week
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-red-600 font-medium mb-2">
                      {data.predictive.cashFlowAlertDates.length} day{data.predictive.cashFlowAlertDates.length > 1 ? 's' : ''} with banking variance &gt; R50
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {data.predictive.cashFlowAlertDates.map((d) => (
                        <span key={d} className="text-[11px] font-mono bg-red-100 text-red-700 rounded px-1.5 py-0.5">
                          {formatDate(d)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <p className="text-xs text-base-400 mt-2">
                  Based on this week&apos;s cashups: expected banking vs cash banked
                </p>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
