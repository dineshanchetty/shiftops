"use client";

import * as React from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Branch } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

// ─── Date preset helpers ───────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = toISODate(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "this_week": {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      return { from: toISODate(monday), to: today };
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISODate(first), to: today };
    }
    case "last_month": {
      const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastLast = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toISODate(firstLast), to: toISODate(lastLast) };
    }
    default:
      return { from: today, to: today };
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReportFilters {
  branchIds: string[];
  dateFrom: string;
  dateTo: string;
}

interface ReportWrapperProps {
  title: string;
  children: React.ReactNode;
  onRun: (filters: ReportFilters) => void;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReportWrapper({
  title,
  children,
  onRun,
  onExportCSV,
  onExportPDF,
}: ReportWrapperProps) {
  const supabase = createClient();
  const { tenant } = useAuth();

  // User context
  const [userRole, setUserRole] = useState<string>("manager");
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filter state
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [preset, setPreset] = useState("this_month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Branch dropdown open state
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setBranchDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load user context + branches, then auto-run
  useEffect(() => {
    async function load() {
      const [{ data: role }, { data: branchIdsData }, { data: branchRows }] =
        await Promise.all([
          supabase.rpc("get_user_role"),
          supabase.rpc("get_user_branch_ids"),
          supabase.from("branches").select("*").order("name"),
        ]);

      const r = (role as string) ?? "manager";
      const bids = (branchIdsData as string[]) ?? [];
      setUserRole(r);

      const visibleBranches =
        r === "owner"
          ? (branchRows ?? [])
          : (branchRows ?? []).filter((b) => bids.includes(b.id));

      setBranches(visibleBranches);

      let defaultBranchIds: string[] = [];
      if (visibleBranches.length > 0) {
        if (r === "owner") {
          defaultBranchIds = visibleBranches.map((b) => b.id);
        } else {
          defaultBranchIds = [visibleBranches[0].id];
        }
        setSelectedBranches(defaultBranchIds);
      }

      const range = getPresetRange("this_month");
      setDateFrom(range.from);
      setDateTo(range.to);

      // Auto-run on load
      if (defaultBranchIds.length > 0) {
        onRunRef.current({
          branchIds: defaultBranchIds,
          dateFrom: range.from,
          dateTo: range.to,
        });
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePresetChange = useCallback((value: string) => {
    setPreset(value);
    if (value !== "custom") {
      const range = getPresetRange(value);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  }, []);

  const toggleBranch = useCallback(
    (id: string) => {
      if (userRole !== "owner") {
        setSelectedBranches([id]);
        setBranchDropdownOpen(false);
        return;
      }
      setSelectedBranches((prev) =>
        prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
      );
    },
    [userRole]
  );

  const handleRun = useCallback(() => {
    onRun({ branchIds: selectedBranches, dateFrom, dateTo });
  }, [onRun, selectedBranches, dateFrom, dateTo]);

  const handleExportPDF = useCallback(() => {
    if (onExportPDF) {
      onExportPDF();
    } else {
      window.print();
    }
  }, [onExportPDF]);

  const branchLabel =
    selectedBranches.length === 0
      ? "Select branch"
      : selectedBranches.length === branches.length && branches.length > 1
      ? "All branches"
      : selectedBranches.length === 1
      ? branches.find((b) => b.id === selectedBranches[0])?.name ?? "1 branch"
      : `${selectedBranches.length} branches`;

  return (
    <div className="w-full">
      {/* Branded header — only visible in print output, hidden on screen
          (every report uses window.print() so this travels with all of them). */}
      <div className="hidden print:flex items-center justify-between border-b-2 border-black pb-2 mb-3">
        <div className="flex items-center gap-2">
          {tenant?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt={tenant?.name ?? ""}
              className="h-8 w-8 rounded object-cover"
            />
          )}
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-black">ShiftOps</div>
            {tenant?.name && (
              <div className="text-[10px] text-gray-500">{tenant.name}</div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          {dateFrom && dateTo && (
            <div className="text-[10px] text-gray-500">
              {dateFrom} → {dateTo}
            </div>
          )}
          <div className="text-[10px] text-gray-500">
            Generated {new Date().toLocaleString("en-ZA")}
          </div>
        </div>
      </div>

      {/* Title (on-screen only — print uses the branded header above) */}
      <h1
        className="text-lg font-semibold text-base-900 mb-4 print:hidden"
        style={{ fontFamily: 'var(--font-display, "Sora", sans-serif)' }}
      >
        {title}
      </h1>

      {/* Filter bar */}
      <div className="sticky top-0 z-20 bg-surface border-b border-base-200 py-3 px-0 mb-6 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          {/* Branch selector */}
          <div className="relative" ref={dropdownRef}>
            <label className="text-sm font-medium text-base-700 block mb-1.5">
              Branch
            </label>
            <button
              type="button"
              onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
              className={cn(
                "h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 text-left min-w-[180px] flex items-center justify-between gap-2",
                "hover:bg-surface-2 transition-colors"
              )}
            >
              <span className="truncate">{branchLabel}</span>
              <svg
                className={cn(
                  "w-4 h-4 text-base-400 transition-transform",
                  branchDropdownOpen && "rotate-180"
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {branchDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-base-200 rounded-lg shadow-lg z-30 max-h-60 overflow-y-auto">
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 cursor-pointer text-sm"
                  >
                    <input
                      type={userRole === "owner" ? "checkbox" : "radio"}
                      checked={selectedBranches.includes(branch.id)}
                      onChange={() => toggleBranch(branch.id)}
                      className="rounded border-base-300"
                    />
                    <span className="text-base-900">{branch.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date preset */}
          <div>
            <label className="text-sm font-medium text-base-700 block mb-1.5">
              Period
            </label>
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="h-10 px-3 rounded-lg border border-base-200 bg-surface text-sm text-base-900 min-w-[140px]"
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Custom date inputs */}
          {preset === "custom" && (
            <>
              <div>
                <Input
                  label="From"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Input
                  label="To"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Run Report */}
          <Button variant="primary" onClick={handleRun}>
            Run Report
          </Button>

          {/* Export buttons */}
          <div className="flex gap-1 ml-auto">
            {onExportCSV && (
              <Button variant="secondary" size="sm" onClick={onExportCSV}>
                CSV
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleExportPDF}>
              PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Report content */}
      {children}

      {/* Print-only footer mark */}
      <div className="hidden print:block mt-4 pt-2 border-t border-dashed border-gray-300 text-center text-[9px] text-gray-400">
        Generated by ShiftOps · shiftops.co.za
      </div>
    </div>
  );
}
