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
  ChevronDown,
  ChevronUp,
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
  last28DaysTurnover: { date: string; gross_turnover: number | null }[];
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

// ─── 3-Month Forecast helpers ─────────────────────────────────────────────────

// SA Public Holidays 2026 (YYYY-MM-DD)
const SA_PUBLIC_HOLIDAYS_2026: Set<string> = new Set([
  '2026-01-01', // New Year's Day
  '2026-03-21', // Human Rights Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Family Day
  '2026-04-27', // Freedom Day
  '2026-05-01', // Workers' Day
  '2026-06-16', // Youth Day
  '2026-08-09', // Women's Day
  '2026-08-10', // Women's Day observed
  '2026-09-24', // Heritage Day
  '2026-12-16', // Day of Reconciliation
  '2026-12-25', // Christmas Day
  '2026-12-26', // Day of Goodwill
]);

interface DailyForecast {
  date: string;          // YYYY-MM-DD
  dayOfWeek: number;     // 0=Sun … 6=Sat
  projectedTurnover: number;
  isPublicHoliday: boolean;
  holidayName?: string;
  recommendedStaff: number;
  isBusy: boolean;       // Fri=5 or Sat=6
}

interface WeekForecast {
  weekStart: string;
  days: DailyForecast[];
  weeklyTotal: number;
  avgStaff: number;
}

interface MonthForecast {
  monthKey: string;      // e.g. "2026-05"
  monthLabel: string;    // e.g. "May 2026"
  projectedTotal: number;
  avgPerDay: number;
  avgStaff: number;
  vsCurrentMonthPct: number | null;
  weeks: WeekForecast[];
}

const HOLIDAY_NAMES_2026: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-03-21': 'Human Rights Day',
  '2026-04-03': 'Good Friday',
  '2026-04-06': 'Family Day',
  '2026-04-27': 'Freedom Day',
  '2026-05-01': "Workers' Day",
  '2026-06-16': 'Youth Day',
  '2026-08-09': "Women's Day",
  '2026-08-10': "Women's Day (observed)",
  '2026-09-24': 'Heritage Day',
  '2026-12-16': 'Day of Reconciliation',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Day of Goodwill',
};

function buildThreeMonthForecast(
  last28: { date: string; gross_turnover: number | null }[],
  currentMonthTurnover: number,
): MonthForecast[] {
  // Filter to days with actual turnover data
  const validDays = last28.filter((c) => c.gross_turnover != null && c.gross_turnover > 0);

  // Build day-of-week averages from last 28 days
  const dowSums: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dowCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
  validDays.forEach((c) => {
    const dow = getDayOfWeek(c.date);
    dowSums[dow] += c.gross_turnover!;
    dowCounts[dow] += 1;
  });
  const dowAvg: number[] = dowSums.map((s, i) => (dowCounts[i] > 0 ? s / dowCounts[i] : 0));

  // Fallback: if any dow has no data, use overall average
  const overallAvg =
    validDays.length > 0
      ? validDays.reduce((s, c) => s + (c.gross_turnover ?? 0), 0) / validDays.length
      : 0;
  const filledDowAvg = dowAvg.map((v) => (v > 0 ? v : overallAvg));

  // Compute growth trend from last 28 days
  // Compare first 14 days vs last 14 days
  const sorted = [...validDays].sort((a, b) => a.date.localeCompare(b.date));
  let growthFactor = 1;
  if (sorted.length >= 4) {
    const half = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, half);
    const secondHalf = sorted.slice(half);
    const firstAvg = firstHalf.reduce((s, c) => s + (c.gross_turnover ?? 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, c) => s + (c.gross_turnover ?? 0), 0) / secondHalf.length;
    if (firstAvg > 0) {
      // Trend per day; extrapolate over ~90 days — cap growth to ±30%
      const rawGrowth = (secondAvg - firstAvg) / firstAvg;
      growthFactor = Math.max(0.7, Math.min(1.3, 1 + rawGrowth));
    }
  }

  // Staffing ratio: historical avg staff per day derived from avgTurnoverPerDay
  // We'll use: staff = ceil(projectedTurnover / (overallAvg / referenceStaff))
  // Without roster data per day, we use a sensible default ratio: 1 staff per R8,000 turnover, min 2
  const TURNOVER_PER_STAFF = overallAvg > 0 ? overallAvg / 5 : 8000; // 5 = default staff count

  function staffForTurnover(t: number): number {
    return Math.max(2, Math.ceil(t / TURNOVER_PER_STAFF));
  }

  // Generate next 90 days starting from tomorrow
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);

  // Group into 3 calendar months
  const monthsMap = new Map<string, DailyForecast[]>();

  for (let i = 0; i < 90; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const monthKey = dateStr.slice(0, 7); // "YYYY-MM"
    const dow = d.getDay(); // 0=Sun … 6=Sat

    const isPublicHoliday = SA_PUBLIC_HOLIDAYS_2026.has(dateStr);
    const baseTurnover = filledDowAvg[dow] * growthFactor;
    const projectedTurnover = isPublicHoliday ? baseTurnover * 0.7 : baseTurnover;
    const recommendedStaff = staffForTurnover(projectedTurnover);
    const isBusy = dow === 5 || dow === 6; // Fri or Sat

    const day: DailyForecast = {
      date: dateStr,
      dayOfWeek: dow,
      projectedTurnover: Math.round(projectedTurnover),
      isPublicHoliday,
      holidayName: isPublicHoliday ? HOLIDAY_NAMES_2026[dateStr] : undefined,
      recommendedStaff,
      isBusy,
    };

    if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, []);
    monthsMap.get(monthKey)!.push(day);
  }

  // Only take the first 3 months
  const monthKeys = Array.from(monthsMap.keys()).slice(0, 3);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return monthKeys.map((monthKey) => {
    const days = monthsMap.get(monthKey)!;
    const projectedTotal = days.reduce((s, d) => s + d.projectedTurnover, 0);
    const avgPerDay = days.length > 0 ? projectedTotal / days.length : 0;
    const avgStaff = days.length > 0
      ? Math.round(days.reduce((s, d) => s + d.recommendedStaff, 0) / days.length)
      : 0;

    const [year, month] = monthKey.split('-').map(Number);
    const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

    const vsCurrentMonthPct =
      currentMonthTurnover > 0
        ? Math.round(((projectedTotal - currentMonthTurnover) / currentMonthTurnover) * 100)
        : null;

    // Group days into ISO weeks (Mon-Sun)
    const weeksMap = new Map<string, DailyForecast[]>();
    days.forEach((day) => {
      // Find Monday of that week
      const d = new Date(day.date + 'T00:00:00');
      const dow = d.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
      const monday = new Date(d);
      monday.setDate(d.getDate() - diff);
      const weekKey = monday.toISOString().split('T')[0];
      if (!weeksMap.has(weekKey)) weeksMap.set(weekKey, []);
      weeksMap.get(weekKey)!.push(day);
    });

    const weeks: WeekForecast[] = Array.from(weeksMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, wDays]) => ({
        weekStart,
        days: wDays,
        weeklyTotal: wDays.reduce((s, d) => s + d.projectedTurnover, 0),
        avgStaff: Math.round(wDays.reduce((s, d) => s + d.recommendedStaff, 0) / wDays.length),
      }));

    return { monthKey, monthLabel, projectedTotal, avgPerDay, avgStaff, vsCurrentMonthPct, weeks };
  });
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
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

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
          last28DaysTurnover: last28,
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

  // ─── 3-Month Forecast (derived client-side from 28-day data) ───────────────
  const threeMonthForecast = buildThreeMonthForecast(
    data.predictive.last28DaysTurnover,
    data.monthlyTurnover,
  );

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

        {/* ── 3-Month Forecast ───────────────────────────────────────── */}
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-accent" />
              3-Month Forecast
            </CardTitle>
            <p className="text-xs text-base-400 mt-1">
              Projected revenue &amp; staffing — based on last 28 days of cashup data with trend adjustment
            </p>
          </CardHeader>
          <CardContent>
            {threeMonthForecast.length === 0 ? (
              <p className="text-sm text-base-400 py-4 text-center">
                Not enough historical data to generate a forecast
              </p>
            ) : (
              <div className="space-y-6">
                {/* Monthly summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {threeMonthForecast.map((month) => {
                    const isUp = month.vsCurrentMonthPct != null && month.vsCurrentMonthPct >= 0;
                    return (
                      <div
                        key={month.monthKey}
                        className="rounded-xl border border-gray-100 bg-gray-50/50 p-5"
                      >
                        <p className="text-xs font-bold uppercase tracking-widest text-base-400 mb-2">
                          {month.monthLabel}
                        </p>
                        <p className="text-2xl font-bold font-mono text-base-900">
                          {formatCurrency(Math.round(month.projectedTotal))}
                        </p>
                        {month.vsCurrentMonthPct != null && (
                          <p className={`text-sm font-semibold mt-1 ${isUp ? 'text-green-600' : 'text-amber-500'}`}>
                            {isUp ? '↑' : '↓'} {Math.abs(month.vsCurrentMonthPct)}% vs current month
                          </p>
                        )}
                        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs text-base-500">
                          <div>
                            <span className="block text-base-400 uppercase tracking-wide mb-0.5">Avg/day</span>
                            <span className="font-mono font-semibold text-base-700">
                              {formatCurrency(Math.round(month.avgPerDay))}
                            </span>
                          </div>
                          <div>
                            <span className="block text-base-400 uppercase tracking-wide mb-0.5">Staff/day</span>
                            <span className="font-semibold text-base-700">{month.avgStaff}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Weekly breakdown per month (collapsible) */}
                <div className="space-y-3">
                  {threeMonthForecast.map((month) => {
                    const isOpen = openMonths.has(month.monthKey);
                    return (
                      <div key={month.monthKey} className="rounded-xl border border-gray-100 overflow-hidden">
                        {/* Month toggle header */}
                        <button
                          onClick={() => toggleMonth(month.monthKey)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <span className="font-semibold text-sm text-base-800">
                            {month.monthLabel} — Weekly Breakdown
                          </span>
                          <span className="text-base-400">
                            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="p-4 overflow-x-auto">
                            <table className="w-full text-xs min-w-[680px]">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left py-2 pr-3 font-semibold text-base-400 uppercase tracking-wide whitespace-nowrap">
                                    Week of
                                  </th>
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                                    <th
                                      key={d}
                                      className={`text-right py-2 px-2 font-semibold uppercase tracking-wide whitespace-nowrap ${
                                        d === 'Fri' || d === 'Sat'
                                          ? 'text-amber-600'
                                          : 'text-base-400'
                                      }`}
                                    >
                                      {d}
                                    </th>
                                  ))}
                                  <th className="text-right py-2 pl-3 font-semibold text-base-400 uppercase tracking-wide whitespace-nowrap">
                                    Weekly Total
                                  </th>
                                  <th className="text-right py-2 pl-3 font-semibold text-base-400 uppercase tracking-wide whitespace-nowrap">
                                    Staff
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {month.weeks.map((week) => {
                                  // Build Mon=1…Sun=0 ordered map
                                  const dayMap = new Map<number, DailyForecast>();
                                  week.days.forEach((d) => dayMap.set(d.dayOfWeek, d));
                                  // Mon=1,Tue=2,…,Sat=6,Sun=0
                                  const orderedDow = [1, 2, 3, 4, 5, 6, 0];

                                  return (
                                    <tr
                                      key={week.weekStart}
                                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                                    >
                                      <td className="py-2.5 pr-3 text-base-500 font-medium whitespace-nowrap">
                                        {week.weekStart.slice(5).replace('-', '/')}
                                      </td>
                                      {orderedDow.map((dow) => {
                                        const day = dayMap.get(dow);
                                        const isBusy = dow === 5 || dow === 6;
                                        if (!day) {
                                          return (
                                            <td key={dow} className="text-right py-2.5 px-2 text-base-200">
                                              —
                                            </td>
                                          );
                                        }
                                        return (
                                          <td
                                            key={dow}
                                            className={`text-right py-2.5 px-2 font-mono whitespace-nowrap ${
                                              day.isPublicHoliday
                                                ? 'text-blue-600 bg-blue-50/60'
                                                : isBusy
                                                  ? 'text-amber-700 font-semibold'
                                                  : 'text-base-700'
                                            }`}
                                            title={day.isPublicHoliday ? day.holidayName : undefined}
                                          >
                                            {formatCurrency(day.projectedTurnover)}
                                            {day.isPublicHoliday && (
                                              <span className="ml-0.5 text-blue-400">*</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="text-right py-2.5 pl-3 font-mono font-semibold text-base-900 whitespace-nowrap">
                                        {formatCurrency(week.weeklyTotal)}
                                      </td>
                                      <td className="text-right py-2.5 pl-3 text-base-500 whitespace-nowrap">
                                        ~{week.avgStaff}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            {/* Legend */}
                            <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-base-400">
                              <span>
                                <span className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />
                                Fri/Sat — busy days
                              </span>
                              <span>
                                <span className="text-blue-400 font-bold mr-1">*</span>
                                Public holiday (70% of normal)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Staffing note */}
                <p className="text-[11px] text-base-400 border-t border-gray-100 pt-3">
                  Staffing estimates are derived from your historical turnover-to-staff ratio. Public holidays are
                  flagged in blue and forecast at 70% of normal turnover. Fri/Sat shown in amber as typically
                  busier days. Forecasts do not account for seasonal promotions or extraordinary events.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
