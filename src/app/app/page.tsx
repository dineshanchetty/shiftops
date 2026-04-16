'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
  BanknoteIcon,
  LayoutDashboard,
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

type DashboardTab = 'overview' | 'roster' | 'forecast' | 'alerts';

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

function getDayName(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short' });
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
  const sorted = [...validDays].sort((a, b) => a.date.localeCompare(b.date));
  let growthFactor = 1;
  if (sorted.length >= 4) {
    const half = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, half);
    const secondHalf = sorted.slice(half);
    const firstAvg = firstHalf.reduce((s, c) => s + (c.gross_turnover ?? 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, c) => s + (c.gross_turnover ?? 0), 0) / secondHalf.length;
    if (firstAvg > 0) {
      const rawGrowth = (secondAvg - firstAvg) / firstAvg;
      growthFactor = Math.max(0.7, Math.min(1.3, 1 + rawGrowth));
    }
  }

  const TURNOVER_PER_STAFF = overallAvg > 0 ? overallAvg / 5 : 8000;

  function staffForTurnover(t: number): number {
    return Math.max(2, Math.ceil(t / TURNOVER_PER_STAFF));
  }

  // Generate 3 full months starting from the 1st of NEXT month
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const monthsMap = new Map<string, DailyForecast[]>();

  for (let i = 0; i < 90; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const monthKey = dateStr.slice(0, 7);
    const dow = d.getDay();

    const isPublicHoliday = SA_PUBLIC_HOLIDAYS_2026.has(dateStr);
    const baseTurnover = filledDowAvg[dow] * growthFactor;
    const projectedTurnover = isPublicHoliday ? baseTurnover * 0.7 : baseTurnover;
    const recommendedStaff = staffForTurnover(projectedTurnover);
    const isBusy = dow === 5 || dow === 6;

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

    const weeksMap = new Map<string, DailyForecast[]>();
    days.forEach((day) => {
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
    <div className={`animate-pulse rounded-xl bg-gray-200 ${className ?? ''}`} />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('overview');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const supabase = createClient();

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
        const { start: lastMonthStart, end: lastMonthEnd } = getLastMonthRange();
        const { start: weekStart, end: weekEnd } = getWeekRange();

        const tomorrow = getTomorrow();
        const days28Ago = getNDaysAgo(28);
        const days7Ago = getNDaysAgo(7);
        const days14Ago = getNDaysAgo(14);

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
          last28CashupsRes,
          tomorrowRosterRes,
          last7CashupsRes,
          priorWeekCashupsRes,
          thisWeekCashupsForAlertRes,
        ] = await Promise.all([
          supabase.from('branches').select('id, name').eq('tenant_id', tenantId),

          supabase
            .from('daily_cashups')
            .select('id, branch_id, status')
            .eq('tenant_id', tenantId)
            .eq('date', today)
            .eq('status', 'submitted'),

          supabase
            .from('daily_cashups')
            .select('gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', monthStart)
            .lte('date', monthEnd),

          supabase
            .from('daily_cashups')
            .select('gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', lastMonthStart)
            .lte('date', lastMonthEnd),

          supabase
            .from('roster_entries')
            .select(`
              id, date, shift_start, shift_end, shift_hours, is_off,
              staff!inner(first_name, last_name, position_id, positions(name))
            `)
            .eq('tenant_id', tenantId)
            .eq('date', today)
            .eq('is_off', false),

          supabase
            .from('daily_cashups')
            .select('id, date, gross_turnover, status, branch_id, branches(name)')
            .eq('tenant_id', tenantId)
            .order('date', { ascending: false })
            .limit(7),

          supabase
            .from('daily_cashups')
            .select('branch_id, gross_turnover, date, status')
            .eq('tenant_id', tenantId)
            .gte('date', weekStart)
            .lte('date', weekEnd),

          supabase
            .from('daily_cashups')
            .select('branch_id, status')
            .eq('tenant_id', tenantId)
            .eq('date', today),

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

          supabase
            .from('daily_cashups')
            .select('date, gross_turnover, cash_banked, discounts, delivery_charges, credit_cards, debtors')
            .eq('tenant_id', tenantId)
            .gte('date', days28Ago)
            .order('date'),

          supabase
            .from('roster_entries')
            .select('id, shift_hours')
            .eq('tenant_id', tenantId)
            .eq('date', tomorrow)
            .eq('is_off', false),

          supabase
            .from('daily_cashups')
            .select('date, gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', days7Ago)
            .order('date'),

          supabase
            .from('daily_cashups')
            .select('gross_turnover')
            .eq('tenant_id', tenantId)
            .gte('date', days14Ago)
            .lt('date', days7Ago),

          supabase
            .from('daily_cashups')
            .select('date, gross_turnover, discounts, delivery_charges, credit_cards, debtors, cash_banked')
            .eq('tenant_id', tenantId)
            .gte('date', weekStart)
            .lte('date', weekEnd),
        ]);

        // ─── Process data ────────────────────────────────────────────────────

        const branches: BranchRow[] = branchesRes.data ?? [];
        const totalBranches = branches.length;
        const todaysCashups = (todayCashupsRes.data ?? []).length;
        const missingCashups = totalBranches - todaysCashups;

        const monthlyTurnover = (monthCashupsRes.data ?? []).reduce(
          (sum, c) => sum + (c.gross_turnover ?? 0), 0
        );
        const lastMonthTurnover = (lastMonthCashupsRes.data ?? []).reduce(
          (sum, c) => sum + (c.gross_turnover ?? 0), 0
        );

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
                ? { first_name: staff.first_name as string, last_name: staff.last_name as string }
                : null,
              positions: positions ?? null,
            };
          }
        );

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

        // ─── Predictive calculations ─────────────────────────────────────────

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

        const tomorrowRosterEntries = (tomorrowRosterRes.data ?? []) as { id: string; shift_hours: number | null }[];
        const scheduledTomorrowStaff = tomorrowRosterEntries.length;

        let recommendedStaff: number | null = null;
        if (tomorrowForecast !== null && last28.length > 0) {
          const avgTurnoverPerDay = last28
            .filter((c) => c.gross_turnover != null && c.gross_turnover > 0)
            .reduce((sum, c) => sum + (c.gross_turnover ?? 0), 0) / Math.max(1, last28.filter((c) => (c.gross_turnover ?? 0) > 0).length);

          const approxHistoricStaff = Math.max(1, scheduledTomorrowStaff || 4);
          const ratio = approxHistoricStaff / Math.max(1, avgTurnoverPerDay);
          recommendedStaff = Math.max(1, Math.round(tomorrowForecast * ratio));
        }

        const last7Raw = (last7CashupsRes.data ?? []) as { date: string; gross_turnover: number | null }[];
        const last7Map = new Map<string, number>();
        last7Raw.forEach((c) => { if (c.gross_turnover != null) last7Map.set(c.date, c.gross_turnover); });

        // Show Mon-Sun of the current week (always 7 days)
        const last7DaysTurnover: { date: string; turnover: number }[] = [];
        const nowDate = new Date();
        const currentDow = nowDate.getDay(); // 0=Sun, 1=Mon...
        const mondayOffset = currentDow === 0 ? -6 : 1 - currentDow;
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() + mondayOffset + i);
          const ds = d.toISOString().split('T')[0];
          last7DaysTurnover.push({ date: ds, turnover: last7Map.get(ds) ?? 0 });
        }

        const thisWeekTotal = last7Raw.reduce((sum, c) => sum + (c.gross_turnover ?? 0), 0);
        const priorWeekTotal = ((priorWeekCashupsRes.data ?? []) as { gross_turnover: number | null }[])
          .reduce((sum, c) => sum + (c.gross_turnover ?? 0), 0);
        const weekTrend = priorWeekTotal > 0
          ? Math.round(((thisWeekTotal - priorWeekTotal) / priorWeekTotal) * 100)
          : null;

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

  // ─── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell title="Dashboard" subtitle="Overview of your franchise operations">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <SkeletonBlock key={i} className="h-[120px]" />
          ))}
        </div>
        <SkeletonBlock className="h-10 mb-4" />
        <div className="space-y-6">
          <SkeletonBlock className="h-[240px]" />
          <SkeletonBlock className="h-[300px]" />
          <SkeletonBlock className="h-[160px]" />
        </div>
      </PageShell>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────────

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

  // ─── Computed values ──────────────────────────────────────────────────────────

  const delta = turnoverDelta(data.monthlyTurnover, data.lastMonthTurnover);
  const today = getToday();

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

  // ─── Alert counts (for badge on Alerts tab) ───────────────────────────────────

  const alertCount =
    data.predictive.cashFlowAlertDates.length +
    data.missingCashups +
    (data.predictive.recommendedStaff != null &&
      data.predictive.scheduledTomorrowStaff < data.predictive.recommendedStaff
      ? 1
      : 0);

  // ─── Tab definitions ──────────────────────────────────────────────────────────

  const tabs: { id: DashboardTab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
    { id: 'roster', label: 'Roster', icon: <Calendar size={15} /> },
    { id: 'forecast', label: 'Forecast', icon: <Sparkles size={15} /> },
    { id: 'alerts', label: 'Alerts', icon: <AlertTriangle size={15} />, badge: alertCount > 0 ? alertCount : undefined },
  ];

  return (
    <PageShell title="Dashboard" subtitle="Overview of your franchise operations">

      {/* ── KPI Cards (always visible) ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Branches"
          value={data.totalBranches}
          icon={<Building2 size={20} />}
          className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100"
        />
        <StatCard
          label="Today's Cashups"
          value={`${data.todaysCashups} of ${data.totalBranches}`}
          icon={<Receipt size={20} />}
          className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100"
        />
        <StatCard
          label="Missing Cashups"
          value={data.missingCashups}
          icon={<AlertTriangle size={20} />}
          className={data.missingCashups > 0 ? "bg-gradient-to-br from-red-50 to-orange-50 border border-red-100" : "bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-100"}
        />
        <StatCard
          label="Monthly Turnover"
          value={formatCurrency(data.monthlyTurnover)}
          delta={delta}
          icon={<TrendingUp size={20} />}
          className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100"
        />
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {tabs.map((tab) => {
          const isActive = dashboardTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setDashboardTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-base-400 hover:text-base-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge != null && (
                <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1.5 py-0.5 min-w-[18px]">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}

      {/* ════════════════════ TAB: OVERVIEW ════════════════════ */}
      {dashboardTab === 'overview' && (
        <div className="space-y-6">

          {/* 7-Day Revenue Bar Chart */}
          <Card className="hover:translate-y-0 hover:shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-accent" />
                  7-Day Revenue
                </CardTitle>
                {data.predictive.weekTrend != null && (
                  <span className={`text-sm font-semibold ${data.predictive.weekTrend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {data.predictive.weekTrend >= 0 ? '↑' : '↓'} {Math.abs(data.predictive.weekTrend)}% vs prev week
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                // For future days (no cashup yet), use the forecast from same-weekday avg
                const vals = data.predictive.last7DaysTurnover.map((v) => {
                  if (v.turnover > 0 || v.date <= today) return v;
                  // Use day-of-week average from last28 data as forecast
                  const dow = getDayOfWeek(v.date);
                  const sameDow = data.predictive.last28DaysTurnover
                    .filter((c) => getDayOfWeek(c.date) === dow && (c.gross_turnover ?? 0) > 0);
                  const forecast = sameDow.length > 0
                    ? sameDow.reduce((s, c) => s + (c.gross_turnover ?? 0), 0) / sameDow.length
                    : 0;
                  return { ...v, turnover: Math.round(forecast), isForecast: true };
                });
                const maxVal = Math.max(...vals.map((v) => v.turnover), 1);
                const nonZeroVals = vals.filter((v) => v.turnover > 0);
                const avgVal = nonZeroVals.length > 0 ? nonZeroVals.reduce((s, v) => s + v.turnover, 0) / nonZeroVals.length : 0;
                const avgPct = maxVal > 0 ? (avgVal / maxVal) * 100 : 0;

                return (
                  <div className="relative">
                    {/* Average line */}
                    <div
                      className="absolute left-0 right-0 border-t border-dashed border-gray-300 z-10 pointer-events-none"
                      style={{ bottom: `calc(${avgPct}% + 24px)` }}
                    >
                      <span className="absolute -top-2.5 right-0 text-[10px] text-gray-400 bg-white px-1">
                        avg {formatCurrency(Math.round(avgVal))}
                      </span>
                    </div>

                    <div className="flex items-end gap-3 h-[220px] px-2">
                      {vals.map((item) => {
                        const { date, turnover } = item;
                        const isForecast = 'isForecast' in item && (item as { isForecast?: boolean }).isForecast;
                        const isToday = date === today;
                        const heightPct = maxVal > 0 && turnover > 0 ? Math.max(8, (turnover / maxVal) * 100) : 0;
                        return (
                          <div key={date} className="flex-1 flex flex-col items-center gap-1.5 group">
                            <span className="text-[10px] font-mono text-gray-500 truncate w-full text-center opacity-0 group-hover:opacity-100 transition-opacity">
                              {turnover > 0 ? formatCurrency(turnover) : '—'}
                            </span>
                            <div className="w-full relative flex items-end" style={{ height: '180px' }}>
                              {turnover > 0 ? (
                                <div
                                  className={`w-full rounded-t-lg transition-all duration-300 ${
                                    isToday
                                      ? 'bg-gradient-to-t from-orange-600 to-orange-400 shadow-lg shadow-orange-200'
                                      : isForecast
                                      ? 'bg-gradient-to-t from-purple-400 to-purple-300 opacity-60 border border-dashed border-purple-400'
                                      : 'bg-gradient-to-t from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300'
                                  }`}
                                  style={{ height: `${heightPct}%` }}
                                />
                              ) : (
                                <div className="w-full h-1 rounded bg-gray-200" />
                              )}
                            </div>
                            <div className="text-center">
                              <span className={`text-[10px] font-semibold ${
                                isToday ? 'text-orange-600' : isForecast ? 'text-purple-500' : 'text-gray-500'
                              }`}>
                                {getDayName(date)}
                              </span>
                              {turnover > 0 && (
                                <div className={`text-[9px] font-mono mt-0.5 ${isForecast ? 'text-purple-400' : 'text-gray-400'}`}>
                                  {isForecast ? '~' : ''}{formatCurrency(turnover)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Recent Cashups (compact) */}
          <Card className="hover:translate-y-0 hover:shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt size={18} className="text-accent" />
                Recent Cashups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentCashups.length === 0 ? (
                <p className="text-sm text-base-400 py-4 text-center">No cashups recorded yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">Date</th>
                        <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">Branch</th>
                        <th className="text-right py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">Gross Turnover</th>
                        <th className="text-right py-2 font-medium text-base-400 uppercase tracking-wide text-xs">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentCashups.map((cashup) => (
                        <tr key={cashup.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-4 text-base-700">{formatDate(cashup.date)}</td>
                          <td className="py-2 pr-4 text-base-900 font-medium">{cashup.branches?.name ?? '\u2014'}</td>
                          <td className="py-2 pr-4 text-right font-mono text-base-900">
                            {cashup.gross_turnover != null ? formatCurrency(cashup.gross_turnover) : '\u2014'}
                          </td>
                          <td className="py-2 text-right">
                            <Badge variant={cashup.status === 'submitted' ? 'success' : 'warning'}>
                              {cashup.status === 'submitted' ? 'Submitted' : 'Draft'}
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

          {/* Branch Overview */}
          <Card className="hover:translate-y-0 hover:shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 size={18} className="text-accent" />
                Branch Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.branchOverviews.length === 0 ? (
                <p className="text-sm text-base-400 py-4 text-center">No branches configured</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.branchOverviews.map((branch) => (
                    <div key={branch.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-semibold text-base-900 text-sm">{branch.name}</h4>
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
                        <span className="text-xs text-base-400 uppercase tracking-wide">This week</span>
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
      )}

      {/* ════════════════════ TAB: ROSTER ════════════════════ */}
      {dashboardTab === 'roster' && (
        <div className="space-y-6">

          {/* Staffing Gauge */}
          {data.predictive.recommendedStaff != null && (
            <Card className="hover:translate-y-0 hover:shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users size={18} className="text-accent" />
                  Staffing for Tomorrow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  {/* Bar gauge */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-base-400 mb-1.5">
                      <span>Scheduled</span>
                      <span className="font-mono">
                        {data.predictive.scheduledTomorrowStaff} / {data.predictive.recommendedStaff} recommended
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                            ? 'bg-green-500'
                            : 'bg-amber-400'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (data.predictive.scheduledTomorrowStaff / data.predictive.recommendedStaff) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className={`text-xs mt-1.5 font-medium ${
                      data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                        ? 'text-green-600'
                        : 'text-amber-500'
                    }`}>
                      {data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                        ? 'Staffing is sufficient for tomorrow'
                        : `${data.predictive.recommendedStaff - data.predictive.scheduledTomorrowStaff} more staff recommended`}
                    </p>
                  </div>
                  {/* Numbers */}
                  <div className="flex gap-6 text-center shrink-0">
                    <div>
                      <p className={`text-3xl font-bold ${
                        data.predictive.scheduledTomorrowStaff >= data.predictive.recommendedStaff
                          ? 'text-green-600'
                          : 'text-amber-500'
                      }`}>
                        {data.predictive.scheduledTomorrowStaff}
                      </p>
                      <p className="text-xs text-base-400">Scheduled</p>
                    </div>
                    <div className="text-base-200 text-2xl font-light self-center">of</div>
                    <div>
                      <p className="text-3xl font-bold text-base-700">{data.predictive.recommendedStaff}</p>
                      <p className="text-xs text-base-400">Recommended</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Today's Roster */}
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
                <p className="text-sm text-base-400 py-4 text-center">No shifts scheduled for today</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">Staff Name</th>
                        <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">Position</th>
                        <th className="text-left py-2 pr-4 font-medium text-base-400 uppercase tracking-wide text-xs">Shift Time</th>
                        <th className="text-right py-2 font-medium text-base-400 uppercase tracking-wide text-xs">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todaysRoster.map((entry) => (
                        <tr key={entry.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 pr-4 text-base-900 font-medium">
                            {entry.staff ? `${entry.staff.first_name} ${entry.staff.last_name}` : '\u2014'}
                          </td>
                          <td className="py-2.5 pr-4 text-base-500">{entry.positions?.name ?? '\u2014'}</td>
                          <td className="py-2.5 pr-4 font-mono text-base-700">
                            {entry.shift_start && entry.shift_end
                              ? `${formatTime(entry.shift_start)} \u2013 ${formatTime(entry.shift_end)}`
                              : '\u2014'}
                          </td>
                          <td className="py-2.5 text-right font-mono text-base-700">
                            {entry.shift_hours != null ? `${entry.shift_hours}h` : '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Roster */}
          {data.upcomingRoster.length > 0 && (
            <Card className="hover:translate-y-0 hover:shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar size={18} className="text-accent" />
                  Upcoming Roster
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.upcomingRoster.map((day) => (
                    <div key={day.date}>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                        <span>{formatDate(day.date)}</span>
                        <span className="text-xs font-normal text-gray-400">
                          {day.entries.filter(e => !e.is_off).length} staff
                        </span>
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

        </div>
      )}

      {/* ════════════════════ TAB: FORECAST ════════════════════ */}
      {dashboardTab === 'forecast' && (
        <div className="space-y-6">

          {/* Tomorrow's Forecast + Trend Sparkline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="hover:translate-y-0 hover:shadow-sm">
              <CardContent className="pt-5">
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
              </CardContent>
            </Card>

            {/* 30-Day Trend Sparkline */}
            <Card className="hover:translate-y-0 hover:shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-base-400">
                    Projected 30-Day Trend
                  </span>
                  <Sparkles size={14} className="text-accent" />
                </div>
                {(() => {
                  // Flatten first 30 days of forecast
                  const next30: number[] = [];
                  for (const month of threeMonthForecast) {
                    for (const day of month.weeks.flatMap(w => w.days)) {
                      if (next30.length < 30) next30.push(day.projectedTurnover);
                    }
                  }
                  if (next30.length === 0) {
                    return <p className="text-sm text-base-400">Not enough data</p>;
                  }
                  const maxV = Math.max(...next30, 1);
                  return (
                    <div className="flex items-end gap-0.5 h-14">
                      {next30.map((val, i) => {
                        const h = Math.max(4, (val / maxV) * 100);
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-accent/30 rounded-sm"
                            style={{ height: `${h}%` }}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
                <p className="text-[10px] text-base-300 mt-1">Next 30 days · based on last 28-day patterns</p>
              </CardContent>
            </Card>
          </div>

          {/* 3-Month Summary Cards */}
          {threeMonthForecast.length === 0 ? (
            <Card className="hover:translate-y-0 hover:shadow-sm">
              <CardContent>
                <p className="text-sm text-base-400 py-4 text-center">
                  Not enough historical data to generate a forecast
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {threeMonthForecast.map((month) => {
                  const isUp = month.vsCurrentMonthPct != null && month.vsCurrentMonthPct >= 0;
                  return (
                    <div key={month.monthKey} className="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
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

              {/* Weekly Breakdown (collapsible) */}
              <div className="space-y-3">
                {threeMonthForecast.map((month) => {
                  const isOpen = openMonths.has(month.monthKey);
                  return (
                    <div key={month.monthKey} className="rounded-xl border border-gray-100 overflow-hidden">
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
                                <th className="text-left py-2 pr-3 font-semibold text-base-400 uppercase tracking-wide whitespace-nowrap">Week of</th>
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                                  <th
                                    key={d}
                                    className={`text-right py-2 px-2 font-semibold uppercase tracking-wide whitespace-nowrap ${
                                      d === 'Fri' || d === 'Sat' ? 'text-amber-600' : 'text-base-400'
                                    }`}
                                  >
                                    {d}
                                  </th>
                                ))}
                                <th className="text-right py-2 pl-3 font-semibold text-base-400 uppercase tracking-wide whitespace-nowrap">Weekly Total</th>
                                <th className="text-right py-2 pl-3 font-semibold text-base-400 uppercase tracking-wide whitespace-nowrap">Staff</th>
                              </tr>
                            </thead>
                            <tbody>
                              {month.weeks.map((week) => {
                                const dayMap = new Map<number, DailyForecast>();
                                week.days.forEach((d) => dayMap.set(d.dayOfWeek, d));
                                const orderedDow = [1, 2, 3, 4, 5, 6, 0];

                                return (
                                  <tr key={week.weekStart} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                    <td className="py-2.5 pr-3 text-base-500 font-medium whitespace-nowrap">
                                      {week.weekStart.slice(5).replace('-', '/')}
                                    </td>
                                    {orderedDow.map((dow) => {
                                      const day = dayMap.get(dow);
                                      const isBusy = dow === 5 || dow === 6;
                                      if (!day) {
                                        return (
                                          <td key={dow} className="text-right py-2.5 px-2 text-base-200">—</td>
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
                                          {day.isPublicHoliday && <span className="ml-0.5 text-blue-400">*</span>}
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

              <p className="text-[11px] text-base-400 border-t border-gray-100 pt-3">
                Staffing estimates are derived from your historical turnover-to-staff ratio. Public holidays are
                flagged in blue and forecast at 70% of normal turnover. Fri/Sat shown in amber as typically
                busier days. Forecasts do not account for seasonal promotions or extraordinary events.
              </p>
            </>
          )}
        </div>
      )}

      {/* ════════════════════ TAB: ALERTS ════════════════════ */}
      {dashboardTab === 'alerts' && (
        <div className="space-y-4">

          {alertCount === 0 && (
            <Card className="hover:translate-y-0 hover:shadow-sm">
              <CardContent className="py-10 text-center">
                <p className="text-green-600 font-medium text-sm">All clear — no active alerts</p>
                <p className="text-xs text-base-400 mt-1">No cash flow issues, missing cashups, or staffing concerns</p>
              </CardContent>
            </Card>
          )}

          {/* Cash Flow Alerts */}
          {data.predictive.cashFlowAlertDates.length > 0 && (
            <Card className="hover:translate-y-0 hover:shadow-sm border-red-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <BanknoteIcon size={18} />
                  Cash Flow Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.predictive.cashFlowAlertDates.map((d) => (
                    <div key={d} className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/50 px-4 py-3">
                      <AlertTriangle size={16} className="text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800">Banking variance &gt; R50</p>
                        <p className="text-xs text-red-500">{formatDate(d)} — expected banking does not match cash banked</p>
                      </div>
                      <a
                        href="/app/cashups"
                        className="text-xs font-medium text-red-600 hover:text-red-800 shrink-0 underline underline-offset-2"
                      >
                        View cashup
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Missing Cashups */}
          {data.missingCashups > 0 && (
            <Card className="hover:translate-y-0 hover:shadow-sm border-amber-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600">
                  <Receipt size={18} />
                  Missing Cashups
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.branchOverviews
                    .filter((b) => b.todayStatus === 'missing')
                    .map((b) => (
                      <div key={b.id} className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3">
                        <Building2 size={16} className="text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-amber-800">{b.name}</p>
                          <p className="text-xs text-amber-500">No cashup submitted for today ({formatDate(today)})</p>
                        </div>
                        <a
                          href="/app/cashups/new"
                          className="text-xs font-medium text-amber-600 hover:text-amber-800 shrink-0 underline underline-offset-2"
                        >
                          Submit cashup
                        </a>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Staffing Alerts */}
          {data.predictive.recommendedStaff != null &&
            data.predictive.scheduledTomorrowStaff < data.predictive.recommendedStaff && (
              <Card className="hover:translate-y-0 hover:shadow-sm border-amber-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <Users size={18} />
                    Staffing Alert
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3">
                    <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">Understaffed tomorrow</p>
                      <p className="text-xs text-amber-500">
                        {data.predictive.scheduledTomorrowStaff} scheduled vs {data.predictive.recommendedStaff} recommended —{' '}
                        {data.predictive.recommendedStaff - data.predictive.scheduledTomorrowStaff} more staff needed
                      </p>
                    </div>
                    <a
                      href="/app/roster"
                      className="text-xs font-medium text-amber-600 hover:text-amber-800 shrink-0 underline underline-offset-2"
                    >
                      Edit roster
                    </a>
                  </div>
                </CardContent>
              </Card>
            )}

        </div>
      )}

    </PageShell>
  );
}
