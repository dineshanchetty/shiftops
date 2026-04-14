"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ReportWrapper,
  type ReportFilters,
} from "@/components/reports/report-wrapper";
import { formatCurrency, cn } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import type { DailyCashup } from "@/lib/types";
import { Target, Save, Calculator, Loader2 } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────

const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtNeg(amount: number): string {
  if (amount < 0) {
    return `(R ${Math.abs(amount).toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`;
  }
  return formatCurrency(amount);
}

/** Get all dates in a month as Date objects */
function getMonthDates(year: number, month: number): Date[] {
  const dates: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(new Date(year, month, d));
  }
  return dates;
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface BudgetSetupRow {
  date: Date;
  isoDate: string;
  dayName: string;
  dateFormatted: string;
  prevYrTO: number;
  markupPct: number;
  budgetAmount: number;
  isOverridden: boolean;
}

interface TurnoverRow {
  date: Date;
  dayName: string;
  dateFormatted: string;
  prevYrTO: number;
  budgetNett: number;
  budgetGross: number;
  actualNett: number;
  difference: number;
  rtDifference: number;
  rtPrevYrTO: number;
  rtBudgetNett: number;
  rtActualTO: number;
  growth: number;
  pctGrowth: number;
}

type ColumnKey =
  | "day"
  | "date"
  | "prevYrTO"
  | "budgetNett"
  | "budgetGross"
  | "actualNett"
  | "difference"
  | "rtDifference"
  | "rtPrevYrTO"
  | "rtBudgetNett"
  | "rtActualTO"
  | "growth"
  | "pctGrowth";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "date", label: "Date" },
  { key: "prevYrTO", label: "Prev Yr T/O" },
  { key: "budgetNett", label: "Budget Nett" },
  { key: "budgetGross", label: "Budget Gross" },
  { key: "actualNett", label: "Actual Nett" },
  { key: "difference", label: "Difference" },
  { key: "rtDifference", label: "R/T Difference" },
  { key: "rtPrevYrTO", label: "R/T Prev Yr T/O" },
  { key: "rtBudgetNett", label: "R/T Budget Nett" },
  { key: "rtActualTO", label: "R/T Actual T/O" },
  { key: "growth", label: "Growth" },
  { key: "pctGrowth", label: "% Growth" },
];

type TabMode = "setup" | "report";

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TurnoverBudgetPage() {
  const supabase = createClient();

  // Active tab
  const [activeTab, setActiveTab] = useState<TabMode>("report");

  // ── Report tab state ──
  const [rows, setRows] = useState<TurnoverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dailyBudgetFallback, setDailyBudgetFallback] = useState(15000);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(
    () => new Set(ALL_COLUMNS.map((c) => c.key))
  );
  const [summaryStats, setSummaryStats] = useState({
    actualWageTotal: 0,
    budgetWageTotal: 0,
    prevYearNettTO: 0,
  });

  // ── Budget Setup tab state ──
  const [setupRows, setSetupRows] = useState<BudgetSetupRow[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupSaved, setSetupSaved] = useState(false);
  const [globalMarkup, setGlobalMarkup] = useState(10);
  const [setupDefaultBudget, setSetupDefaultBudget] = useState(15000);
  const [setupBranchId, setSetupBranchId] = useState<string | null>(null);
  const [setupTenantId, setSetupTenantId] = useState<string | null>(null);
  const [tableExists, setTableExists] = useState(true);

  // Keep last-used filters for cross-tab queries
  const lastFiltersRef = useRef<ReportFilters | null>(null);

  // ── Column toggles ──
  const toggleCol = useCallback((key: ColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Helper: fetch prev year turnover for a month ──
  const fetchPrevYearTurnover = useCallback(
    async (branchIds: string[], year: number, month: number) => {
      const prevYear = year - 1;
      const fromDate = `${prevYear}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(prevYear, month + 1, 0).getDate();
      const toDate = `${prevYear}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("date, gross_turnover")
        .in("branch_id", branchIds)
        .gte("date", fromDate)
        .lte("date", toDate);

      const map = new Map<number, number>();
      if (cashups) {
        for (const c of cashups) {
          const day = new Date(c.date + "T00:00:00").getDate();
          map.set(day, (map.get(day) ?? 0) + (c.gross_turnover ?? 0));
        }
      }
      return map;
    },
    [supabase]
  );

  // ── Helper: fetch saved daily budgets for a month ──
  const fetchSavedBudgets = useCallback(
    async (branchId: string, year: number, month: number) => {
      const fromDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const toDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      try {
        const { data, error } = await supabase
          .from("daily_budgets")
          .select("date, budget_amount, prev_year_turnover, markup_pct")
          .eq("branch_id", branchId)
          .gte("date", fromDate)
          .lte("date", toDate);

        if (error) {
          // Table might not exist yet
          if (
            error.message.includes("does not exist") ||
            error.code === "42P01"
          ) {
            setTableExists(false);
            return new Map<string, { budget: number; prevYr: number; markup: number }>();
          }
          console.error("Error fetching daily_budgets:", error);
          return new Map<string, { budget: number; prevYr: number; markup: number }>();
        }

        setTableExists(true);
        const map = new Map<string, { budget: number; prevYr: number; markup: number }>();
        if (data) {
          for (const row of data) {
            map.set(row.date, {
              budget: Number(row.budget_amount),
              prevYr: Number(row.prev_year_turnover ?? 0),
              markup: Number(row.markup_pct ?? 0),
            });
          }
        }
        return map;
      } catch {
        setTableExists(false);
        return new Map<string, { budget: number; prevYr: number; markup: number }>();
      }
    },
    [supabase]
  );

  // ── Budget Setup: Load data for month ──
  const loadBudgetSetup = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setSetupLoading(true);
      setSetupSaved(false);

      const branchId = f.branchIds[0]; // Budget setup works per-branch
      setSetupBranchId(branchId);

      // Get tenant_id for upsert
      const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
      setSetupTenantId(tenantId as string | null);

      const fromDate = new Date(f.dateFrom + "T00:00:00");
      const year = fromDate.getFullYear();
      const month = fromDate.getMonth();

      // Fetch prev year turnover and any saved budgets in parallel
      const [prevYrMap, savedMap] = await Promise.all([
        fetchPrevYearTurnover(f.branchIds, year, month),
        fetchSavedBudgets(branchId, year, month),
      ]);

      const monthDates = getMonthDates(year, month);
      const newRows: BudgetSetupRow[] = monthDates.map((d) => {
        const iso = toISODate(d);
        const dayOfMonth = d.getDate();
        const prevYr = prevYrMap.get(dayOfMonth) ?? 0;
        const saved = savedMap.get(iso);

        let budgetAmount: number;
        let markupPct: number;
        let isOverridden = false;

        if (saved) {
          budgetAmount = saved.budget;
          markupPct = saved.markup;
          isOverridden = true;
        } else if (prevYr > 0) {
          markupPct = globalMarkup;
          budgetAmount = Math.round(prevYr * (1 + globalMarkup / 100) * 100) / 100;
        } else {
          markupPct = globalMarkup;
          budgetAmount = setupDefaultBudget;
        }

        return {
          date: d,
          isoDate: iso,
          dayName: DAY_NAMES_FULL[d.getDay()],
          dateFormatted: fmtDate(d),
          prevYrTO: prevYr,
          markupPct,
          budgetAmount,
          isOverridden,
        };
      });

      setSetupRows(newRows);
      setSetupLoading(false);
    },
    [supabase, fetchPrevYearTurnover, fetchSavedBudgets, globalMarkup, setupDefaultBudget]
  );

  // ── Budget Setup: Apply markup to all rows ──
  const applyMarkup = useCallback(() => {
    setSetupRows((prev) =>
      prev.map((row) => {
        if (row.prevYrTO > 0) {
          return {
            ...row,
            markupPct: globalMarkup,
            budgetAmount:
              Math.round(row.prevYrTO * (1 + globalMarkup / 100) * 100) / 100,
            isOverridden: false,
          };
        }
        return {
          ...row,
          markupPct: globalMarkup,
          budgetAmount: setupDefaultBudget,
          isOverridden: false,
        };
      })
    );
    setSetupSaved(false);
  }, [globalMarkup, setupDefaultBudget]);

  // ── Budget Setup: Update individual day ──
  const updateBudgetDay = useCallback((isoDate: string, value: number) => {
    setSetupRows((prev) =>
      prev.map((row) =>
        row.isoDate === isoDate
          ? { ...row, budgetAmount: value, isOverridden: true }
          : row
      )
    );
    setSetupSaved(false);
  }, []);

  // ── Budget Setup: Save all budgets ──
  const saveBudgets = useCallback(async () => {
    if (!setupBranchId || !setupTenantId || setupRows.length === 0) return;
    setSetupSaving(true);

    const upsertData = setupRows.map((row) => ({
      tenant_id: setupTenantId,
      branch_id: setupBranchId,
      date: row.isoDate,
      budget_amount: row.budgetAmount,
      prev_year_turnover: row.prevYrTO || null,
      markup_pct: row.markupPct,
    }));

    try {
      const { error } = await supabase
        .from("daily_budgets")
        .upsert(upsertData, { onConflict: "branch_id,date" });

      if (error) {
        if (
          error.message.includes("does not exist") ||
          error.code === "42P01"
        ) {
          setTableExists(false);
          alert(
            "The daily_budgets table does not exist yet. Run the migration 006_daily_budgets.sql first."
          );
        } else {
          console.error("Error saving budgets:", error);
          alert("Failed to save budgets: " + error.message);
        }
      } else {
        setSetupSaved(true);
        setTableExists(true);
      }
    } catch (err) {
      console.error("Error saving budgets:", err);
      setTableExists(false);
      alert(
        "Failed to save budgets. The daily_budgets table may not exist yet. Run migration 006_daily_budgets.sql."
      );
    }

    setSetupSaving(false);
  }, [supabase, setupBranchId, setupTenantId, setupRows]);

  // ── Report tab: Run report ──
  const handleRun = useCallback(
    async (f: ReportFilters) => {
      lastFiltersRef.current = f;

      if (activeTab === "setup") {
        await loadBudgetSetup(f);
        return;
      }

      if (f.branchIds.length === 0) return;
      setLoading(true);

      const fromDate = new Date(f.dateFrom + "T00:00:00");
      const year = fromDate.getFullYear();
      const month = fromDate.getMonth();

      // Fetch actuals, prev year, and saved budgets in parallel
      const [cashupsResult, prevYrMap, savedBudgetsMap] = await Promise.all([
        supabase
          .from("daily_cashups")
          .select("*")
          .in("branch_id", f.branchIds)
          .gte("date", f.dateFrom)
          .lte("date", f.dateTo)
          .order("date", { ascending: true }),
        fetchPrevYearTurnover(f.branchIds, year, month),
        f.branchIds.length === 1
          ? fetchSavedBudgets(f.branchIds[0], year, month)
          : Promise.resolve(new Map<string, { budget: number; prevYr: number; markup: number }>()),
      ]);

      const cashups = cashupsResult.data;

      // Build actual turnover map
      const actualByDate = new Map<string, number>();
      let totalWages = 0;
      if (cashups) {
        for (const c of cashups as DailyCashup[]) {
          const existing = actualByDate.get(c.date) ?? 0;
          actualByDate.set(c.date, existing + (c.gross_turnover ?? 0));
          totalWages += (c as Record<string, unknown>).total_wages
            ? Number((c as Record<string, unknown>).total_wages)
            : 0;
        }
      }

      // Generate rows for the selected period
      const toDate = new Date(f.dateTo + "T00:00:00");
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const startDate = monthStart < fromDate ? fromDate : monthStart;
      const endDate = monthEnd > toDate ? toDate : monthEnd;

      const allRows: TurnoverRow[] = [];
      let rtDiff = 0;
      let rtPrevYr = 0;
      let rtBudget = 0;
      let rtActual = 0;

      const current = new Date(startDate);
      while (current <= endDate) {
        const iso = toISODate(current);
        const dayOfMonth = current.getDate();
        const actualNett = actualByDate.get(iso) ?? 0;
        const prevYr = prevYrMap.get(dayOfMonth) ?? 0;

        // Budget: prefer saved daily budget, fall back to flat daily amount
        const saved = savedBudgetsMap.get(iso);
        const budgetNett = saved ? saved.budget : dailyBudgetFallback;
        const budgetGross = budgetNett * 1.15;
        const diff = actualNett - budgetNett;

        rtDiff += diff;
        rtPrevYr += prevYr;
        rtBudget += budgetNett;
        rtActual += actualNett;

        const growth = rtActual - rtBudget;
        const pctGrowth = rtBudget === 0 ? 0 : (rtActual / rtBudget) * 100 - 100;

        allRows.push({
          date: new Date(current),
          dayName: DAY_NAMES_SHORT[current.getDay()],
          dateFormatted: fmtDate(current),
          prevYrTO: prevYr,
          budgetNett,
          budgetGross,
          actualNett,
          difference: diff,
          rtDifference: rtDiff,
          rtPrevYrTO: rtPrevYr,
          rtBudgetNett: rtBudget,
          rtActualTO: rtActual,
          growth,
          pctGrowth,
        });

        current.setDate(current.getDate() + 1);
      }

      setRows(allRows);

      const totalDays = allRows.length;
      const totalBudgetNett = allRows.reduce((s, r) => s + r.budgetNett, 0);
      const budgetWageTotal = totalDays > 0 ? totalBudgetNett * 0.28 : 0;
      setSummaryStats({
        actualWageTotal: totalWages,
        budgetWageTotal,
        prevYearNettTO: allRows.reduce((s, r) => s + r.prevYrTO, 0),
      });

      setLoading(false);
    },
    [
      supabase,
      activeTab,
      dailyBudgetFallback,
      fetchPrevYearTurnover,
      fetchSavedBudgets,
      loadBudgetSetup,
    ]
  );

  // When switching tabs, re-run with last filters
  const switchTab = useCallback(
    (tab: TabMode) => {
      setActiveTab(tab);
      if (lastFiltersRef.current) {
        // We need to manually trigger the correct load based on new tab
        if (tab === "setup") {
          loadBudgetSetup(lastFiltersRef.current);
        }
        // Report tab will re-run via the next handleRun call
      }
    },
    [loadBudgetSetup]
  );

  // ── Derived totals for report ──
  const totals = useMemo(() => {
    const totalActualNett = rows.reduce((s, r) => s + r.actualNett, 0);
    const totalBudgetNett = rows.reduce((s, r) => s + r.budgetNett, 0);
    const totalDifference = totalActualNett - totalBudgetNett;
    const totalBudgetGross = rows.reduce((s, r) => s + r.budgetGross, 0);
    const totalPrevYr = rows.reduce((s, r) => s + r.prevYrTO, 0);
    return { totalActualNett, totalBudgetNett, totalDifference, totalBudgetGross, totalPrevYr };
  }, [rows]);

  // ── Budget Setup totals ──
  const setupTotals = useMemo(() => {
    const totalPrevYr = setupRows.reduce((s, r) => s + r.prevYrTO, 0);
    const totalBudget = setupRows.reduce((s, r) => s + r.budgetAmount, 0);
    return { totalPrevYr, totalBudget };
  }, [setupRows]);

  // ── CSV Export ──
  const handleExportCSV = useCallback(() => {
    if (activeTab === "setup") {
      // Export budget setup
      const headers = ["Day", "Date", "Prev Yr T/O", "Markup %", "Budget"];
      const csvRows = setupRows.map((r) => [
        r.dayName,
        r.dateFormatted,
        r.prevYrTO,
        r.markupPct + "%",
        r.budgetAmount,
      ]);
      csvRows.push([
        "Totals",
        "",
        setupTotals.totalPrevYr,
        "",
        setupTotals.totalBudget,
      ]);
      triggerDownload(
        generateCSV(headers, csvRows),
        "budget-setup.csv",
        "text/csv"
      );
      return;
    }

    // Export report
    const headers = ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map(
      (c) => c.label
    );
    const csvRows = rows.map((r) => {
      const vals: (string | number)[] = [];
      if (visibleCols.has("day")) vals.push(r.dayName);
      if (visibleCols.has("date")) vals.push(r.dateFormatted);
      if (visibleCols.has("prevYrTO")) vals.push(r.prevYrTO);
      if (visibleCols.has("budgetNett")) vals.push(r.budgetNett);
      if (visibleCols.has("budgetGross")) vals.push(r.budgetGross);
      if (visibleCols.has("actualNett")) vals.push(r.actualNett);
      if (visibleCols.has("difference")) vals.push(r.difference);
      if (visibleCols.has("rtDifference")) vals.push(r.rtDifference);
      if (visibleCols.has("rtPrevYrTO")) vals.push(r.rtPrevYrTO);
      if (visibleCols.has("rtBudgetNett")) vals.push(r.rtBudgetNett);
      if (visibleCols.has("rtActualTO")) vals.push(r.rtActualTO);
      if (visibleCols.has("growth")) vals.push(r.growth);
      if (visibleCols.has("pctGrowth")) vals.push(r.pctGrowth.toFixed(2) + "%");
      return vals;
    });
    triggerDownload(
      generateCSV(headers, csvRows),
      "turnover-actual-vs-budget.csv",
      "text/csv"
    );
  }, [activeTab, rows, setupRows, visibleCols, setupTotals]);

  const isCol = (k: ColumnKey) => visibleCols.has(k);

  const actualWagesPct =
    totals.totalActualNett === 0
      ? 0
      : (summaryStats.actualWageTotal / totals.totalActualNett) * 100;
  const budgetWagesPct =
    totals.totalBudgetNett === 0
      ? 0
      : (summaryStats.budgetWageTotal / totals.totalBudgetNett) * 100;

  return (
    <ReportWrapper
      title="Turnover Report: Actual vs Budget"
      onRun={handleRun}
      onExportCSV={handleExportCSV}
    >
      {/* Tab switcher */}
      <div className="flex gap-0 mb-4 print:hidden border-b border-base-200">
        <button
          type="button"
          onClick={() => switchTab("setup")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "setup"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-base-500 hover:text-base-700"
          )}
        >
          Budget Setup
        </button>
        <button
          type="button"
          onClick={() => switchTab("report")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "report"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-base-500 hover:text-base-700"
          )}
        >
          Report
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BUDGET SETUP TAB                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "setup" && (
        <>
          {/* Table-not-exists warning */}
          {!tableExists && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Note:</strong> The <code>daily_budgets</code> table does
              not exist yet. Budgets are stored locally until you run the
              migration{" "}
              <code className="bg-amber-100 px-1 rounded">
                006_daily_budgets.sql
              </code>
              .
            </div>
          )}

          {/* Markup controls */}
          <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
            <div>
              <label className="text-sm font-medium text-base-700 block mb-1.5">
                Markup %
              </label>
              <input
                type="number"
                value={globalMarkup}
                onChange={(e) => setGlobalMarkup(Number(e.target.value) || 0)}
                className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-24"
                min={0}
                step={1}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-base-700 block mb-1.5">
                Default Budget (no prev yr)
              </label>
              <input
                type="number"
                value={setupDefaultBudget}
                onChange={(e) =>
                  setSetupDefaultBudget(Number(e.target.value) || 0)
                }
                className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-36"
                min={0}
              />
            </div>
            <button
              type="button"
              onClick={applyMarkup}
              className="h-10 px-4 rounded-lg bg-base-100 hover:bg-base-200 text-sm font-medium text-base-700 transition-colors flex items-center gap-1.5"
            >
              <Calculator className="h-4 w-4" />
              Apply Markup
            </button>
            <button
              type="button"
              onClick={saveBudgets}
              disabled={setupSaving || setupRows.length === 0}
              className={cn(
                "h-10 px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                setupSaved
                  ? "bg-green-100 text-green-700"
                  : "bg-brand-500 hover:bg-brand-600 text-white",
                (setupSaving || setupRows.length === 0) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              {setupSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {setupSaved ? "Saved" : "Save All"}
            </button>
          </div>

          {/* Loading */}
          {setupLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-surface-2 rounded animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!setupLoading && setupRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-base-400">
              <Calculator className="h-12 w-12 mb-3" />
              <p className="text-sm">
                Select a branch and period, then click Run Report to load budget
                setup
              </p>
            </div>
          )}

          {/* Budget setup table */}
          {!setupLoading && setupRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-base-200">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-2">
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky top-0 bg-surface-2">
                      Day
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky top-0 bg-surface-2">
                      Date
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Prev Yr T/O
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-center sticky top-0 bg-surface-2">
                      Markup %
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                      Budget (editable)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {setupRows.map((r) => (
                    <tr
                      key={r.isoDate}
                      className={cn(
                        "border-b border-base-200 hover:bg-surface-2 transition-colors",
                        r.date.getDay() === 0 && "bg-base-50"
                      )}
                    >
                      <td className="px-3 py-1.5 text-base-900">
                        {r.dayName}
                      </td>
                      <td className="px-3 py-1.5 text-base-900">
                        {r.dateFormatted}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-base-900">
                        {r.prevYrTO > 0 ? formatCurrency(r.prevYrTO) : "-"}
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono text-base-500">
                        {r.markupPct}%
                      </td>
                      <td className="px-3 py-1 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-base-400 text-xs">R</span>
                          <input
                            type="number"
                            value={r.budgetAmount}
                            onChange={(e) =>
                              updateBudgetDay(
                                r.isoDate,
                                Number(e.target.value) || 0
                              )
                            }
                            className={cn(
                              "h-8 px-2 rounded border text-sm font-mono text-right w-32",
                              r.isOverridden
                                ? "border-brand-300 bg-brand-50"
                                : "border-base-200 bg-surface"
                            )}
                            min={0}
                            step={0.01}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-2 font-semibold">
                    <td className="px-3 py-2 text-base-900">Totals</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-mono text-base-900">
                      {formatCurrency(setupTotals.totalPrevYr)}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-mono text-base-900">
                      {formatCurrency(setupTotals.totalBudget)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* REPORT TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "report" && (
        <>
          {/* Fallback budget input */}
          <div className="flex items-end gap-3 mb-4 print:hidden">
            <div>
              <label className="text-sm font-medium text-base-700 block mb-1.5">
                Fallback Daily Budget Nett (R)
              </label>
              <input
                type="number"
                value={dailyBudgetFallback}
                onChange={(e) =>
                  setDailyBudgetFallback(Number(e.target.value) || 0)
                }
                className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 font-mono w-40"
              />
              <p className="text-xs text-base-400 mt-1">
                Used when no saved budget exists for a day
              </p>
            </div>
          </div>

          {/* Show Columns toggles */}
          <div className="mb-4 print:hidden">
            <p className="text-xs font-semibold text-base-500 uppercase tracking-wide mb-2">
              Show Columns
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {ALL_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-1.5 text-sm text-base-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onChange={() => toggleCol(col.key)}
                    className="rounded border-base-300"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-surface-2 rounded animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-base-400">
              <Target className="h-12 w-12 mb-3" />
              <p className="text-sm">No data for selected period</p>
            </div>
          )}

          {/* Table */}
          {!loading && rows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-base-200">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-surface-2">
                      {isCol("day") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky top-0 bg-surface-2">
                          Day
                        </th>
                      )}
                      {isCol("date") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-left sticky top-0 bg-surface-2">
                          Date
                        </th>
                      )}
                      {isCol("prevYrTO") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          Prev Yr T/O
                        </th>
                      )}
                      {isCol("budgetNett") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          Budget Nett
                        </th>
                      )}
                      {isCol("budgetGross") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          Budget Gross
                        </th>
                      )}
                      {isCol("actualNett") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          Actual Nett
                        </th>
                      )}
                      {isCol("difference") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          Difference
                        </th>
                      )}
                      {isCol("rtDifference") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          R/T Difference
                        </th>
                      )}
                      {isCol("rtPrevYrTO") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          R/T Prev Yr T/O
                        </th>
                      )}
                      {isCol("rtBudgetNett") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          R/T Budget Nett
                        </th>
                      )}
                      {isCol("rtActualTO") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          R/T Actual T/O
                        </th>
                      )}
                      {isCol("growth") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          Growth
                        </th>
                      )}
                      {isCol("pctGrowth") && (
                        <th className="px-3 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 text-right sticky top-0 bg-surface-2">
                          % Growth
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-base-200 hover:bg-surface-2 transition-colors"
                      >
                        {isCol("day") && (
                          <td className="px-3 py-1.5 text-base-900">
                            {r.dayName}
                          </td>
                        )}
                        {isCol("date") && (
                          <td className="px-3 py-1.5 text-base-900">
                            {r.dateFormatted}
                          </td>
                        )}
                        {isCol("prevYrTO") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.prevYrTO)}
                          </td>
                        )}
                        {isCol("budgetNett") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.budgetNett)}
                          </td>
                        )}
                        {isCol("budgetGross") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.budgetGross)}
                          </td>
                        )}
                        {isCol("actualNett") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.actualNett)}
                          </td>
                        )}
                        {isCol("difference") && (
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right font-mono font-semibold",
                              r.difference < 0
                                ? "text-red-600"
                                : "text-base-900"
                            )}
                          >
                            {fmtNeg(r.difference)}
                          </td>
                        )}
                        {isCol("rtDifference") && (
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right font-mono font-semibold",
                              r.rtDifference < 0
                                ? "text-red-600"
                                : "text-base-900"
                            )}
                          >
                            {fmtNeg(r.rtDifference)}
                          </td>
                        )}
                        {isCol("rtPrevYrTO") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.rtPrevYrTO)}
                          </td>
                        )}
                        {isCol("rtBudgetNett") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.rtBudgetNett)}
                          </td>
                        )}
                        {isCol("rtActualTO") && (
                          <td className="px-3 py-1.5 text-right font-mono text-base-900">
                            {formatCurrency(r.rtActualTO)}
                          </td>
                        )}
                        {isCol("growth") && (
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right font-mono font-semibold",
                              r.growth < 0 ? "text-red-600" : "text-base-900"
                            )}
                          >
                            {fmtNeg(r.growth)}
                          </td>
                        )}
                        {isCol("pctGrowth") && (
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right font-mono font-semibold",
                              r.pctGrowth < 0
                                ? "text-red-600"
                                : "text-base-900"
                            )}
                          >
                            {r.pctGrowth < 0
                              ? `(${Math.abs(r.pctGrowth).toFixed(2)}%)`
                              : `${r.pctGrowth.toFixed(2)}%`}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2 font-semibold">
                      {isCol("day") && (
                        <td className="px-3 py-2 text-base-900">Totals</td>
                      )}
                      {isCol("date") && !isCol("day") && (
                        <td className="px-3 py-2 text-base-900">Totals</td>
                      )}
                      {isCol("date") && isCol("day") && (
                        <td className="px-3 py-2 text-base-900" />
                      )}
                      {isCol("prevYrTO") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900">
                          {formatCurrency(totals.totalPrevYr)}
                        </td>
                      )}
                      {isCol("budgetNett") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900">
                          {formatCurrency(totals.totalBudgetNett)}
                        </td>
                      )}
                      {isCol("budgetGross") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900">
                          {formatCurrency(totals.totalBudgetGross)}
                        </td>
                      )}
                      {isCol("actualNett") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900">
                          {formatCurrency(totals.totalActualNett)}
                        </td>
                      )}
                      {isCol("difference") && (
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-mono font-semibold",
                            totals.totalDifference < 0
                              ? "text-red-600"
                              : "text-base-900"
                          )}
                        >
                          {fmtNeg(totals.totalDifference)}
                        </td>
                      )}
                      {isCol("rtDifference") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900" />
                      )}
                      {isCol("rtPrevYrTO") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900" />
                      )}
                      {isCol("rtBudgetNett") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900" />
                      )}
                      {isCol("rtActualTO") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900" />
                      )}
                      {isCol("growth") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900" />
                      )}
                      {isCol("pctGrowth") && (
                        <td className="px-3 py-2 text-right font-mono text-base-900" />
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Summary stats block */}
              <div className="mt-6 rounded-lg border border-base-200 bg-surface p-4">
                <h3 className="text-sm font-semibold text-base-700 mb-3 uppercase tracking-wide">
                  Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-base-500">Actual Wage Total</span>
                    <span className="font-mono text-base-900">
                      {formatCurrency(summaryStats.actualWageTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">Budget Wage Total</span>
                    <span className="font-mono text-base-900">
                      {formatCurrency(summaryStats.budgetWageTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">Wage Difference</span>
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        summaryStats.actualWageTotal -
                          summaryStats.budgetWageTotal <
                          0
                          ? "text-red-600"
                          : "text-base-900"
                      )}
                    >
                      {fmtNeg(
                        summaryStats.actualWageTotal -
                          summaryStats.budgetWageTotal
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">
                      Previous Year Nett T/O
                    </span>
                    <span className="font-mono text-base-900">
                      {formatCurrency(summaryStats.prevYearNettTO)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">Actual Nett Turnover</span>
                    <span className="font-mono text-base-900">
                      {formatCurrency(totals.totalActualNett)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">Budget Nett Turnover</span>
                    <span className="font-mono text-base-900">
                      {formatCurrency(totals.totalBudgetNett)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">Turnover Difference</span>
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        totals.totalDifference < 0
                          ? "text-red-600"
                          : "text-base-900"
                      )}
                    >
                      {fmtNeg(totals.totalDifference)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">
                      Actual Wages % Of Turnover
                    </span>
                    <span className="font-mono text-base-900">
                      {actualWagesPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-base-500">
                      Budget Wages % Of Turnover
                    </span>
                    <span className="font-mono text-base-900">
                      {budgetWagesPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </ReportWrapper>
  );
}
