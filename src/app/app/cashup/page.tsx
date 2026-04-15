"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  AlertTriangle,
  CloudDownload,
  Loader2,
  Pencil,
  Eye,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { CashupForm } from "@/components/cashup/cashup-form";
import {
  loadCashup,
  checkAuraImport,
  getDriversFromRoster,
  getRosteredStaff,
  getPaymentChannels,
  getUserBranches,
  getUserTenantId,
  unlockCashup,
  getCashupHistory,
  type CashupWithRelations,
  type CashupHistoryRow,
  type DriverFromRoster,
  type RosteredStaffEntry,
} from "./actions";
import type { AuraImport } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type StatusBanner = "aura" | "manual" | "submitted" | null;

export default function CashupPage() {
  // ─── Selection state ────────────────────────────────────────────────
  const [branches, setBranches] = useState<{ id: string; name: string }[]>(
    []
  );
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isPending, startTransition] = useTransition();

  // ─── Loaded data ────────────────────────────────────────────────────
  const [cashup, setCashup] = useState<CashupWithRelations | null>(null);
  const [auraImport, setAuraImport] = useState<AuraImport | null>(null);
  const [drivers, setDrivers] = useState<DriverFromRoster[]>([]);
  const [channels, setChannels] = useState<{ channel_name: string }[]>([]);
  const [rosteredStaff, setRosteredStaff] = useState<RosteredStaffEntry[]>([]);
  const [status, setStatus] = useState<StatusBanner>(null);
  const [loaded, setLoaded] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [tenantId, setTenantId] = useState("");

  // ─── Cashup history ────────────────────────────────────────────────
  const [history, setHistory] = useState<CashupHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ─── Load branches on first mount ───────────────────────────────────
  useEffect(() => {
    if (branchesLoaded) return;
    startTransition(async () => {
      try {
        const [b, tid] = await Promise.all([getUserBranches(), getUserTenantId()]);
        setBranches(b);
        setTenantId(tid);
        if (b.length === 1) {
          setBranchId(b[0].id);
        }
      } catch (e) {
        console.error("Failed to load branches:", e);
      } finally {
        setBranchesLoaded(true);
      }
    });
  }, [branchesLoaded]);

  // ─── Auto-load cashup history when branch changes or returning from form ──
  useEffect(() => {
    if (!branchId) {
      setHistory([]);
      return;
    }
    // Refresh history when branch changes OR when returning from form (loaded becomes false)
    if (loaded) return;
    let cancelled = false;
    setHistoryLoading(true);
    getCashupHistory(branchId)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, loaded]);

  // ─── Load cashup data ──────────────────────────────────────────────
  const handleLoad = useCallback(
    (dateOverride?: string) => {
      const loadDate = dateOverride ?? date;
      if (!branchId || !loadDate) return;

      if (dateOverride) {
        setDate(dateOverride);
      }

      startTransition(async () => {
        const [cashupData, auraData, driverData, channelData, staffData] =
          await Promise.all([
            loadCashup(branchId, loadDate),
            checkAuraImport(branchId, loadDate),
            getDriversFromRoster(branchId, loadDate),
            getPaymentChannels(branchId),
            getRosteredStaff(branchId, loadDate),
          ]);

        setCashup(cashupData);
        setAuraImport(auraData);
        setDrivers(driverData);
        setChannels(channelData);
        setRosteredStaff(staffData);

        if (cashupData?.status === "submitted") {
          setStatus("submitted");
        } else if (auraData) {
          setStatus("aura");
        } else {
          setStatus("manual");
        }

        setLoaded(true);
        setFormKey((k) => k + 1);
      });
    },
    [branchId, date]
  );

  // ─── Unlock handler ────────────────────────────────────────────────
  const handleUnlock = useCallback(() => {
    if (!cashup?.id) return;
    startTransition(async () => {
      const result = await unlockCashup(cashup.id);
      if (result.success) {
        setStatus("aura");
        // Reload to refresh state
        handleLoad();
      }
    });
  }, [cashup?.id, handleLoad]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <PageShell title="Daily Cashup">
      {/* ── Header controls ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          className="h-10 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent min-w-[200px]"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setLoaded(false);
          }}
        >
          <option value="">Select branch...</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="h-10 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setLoaded(false);
          }}
        />

        <Button
          variant="primary"
          onClick={() => handleLoad()}
          disabled={!branchId || !date || isPending}
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Load
        </Button>
      </div>

      {/* ── Recent Cashups history table ────────────────────────────── */}
      {!loaded && branchId && !isPending && (
        <div className="rounded-xl border border-base-200 bg-surface mb-6">
          <div className="px-4 py-3 border-b border-base-200">
            <h3 className="text-sm font-semibold text-base-900">
              Recent Cashups
            </h3>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-base-400">
              <p className="text-sm">
                No cashups recorded for this branch yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-base-200 text-left text-xs font-medium text-base-500 uppercase tracking-wider">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right hidden sm:table-cell">
                      Gross Turnover
                    </th>
                    <th className="px-4 py-2 text-right hidden md:table-cell">
                      Cash Banked
                    </th>
                    <th className="px-4 py-2 text-right hidden md:table-cell">
                      Variance
                    </th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, idx) => {
                    const turnover = row.gross_turnover ?? 0;
                    const discounts = row.discounts ?? 0;
                    const delCharges = row.delivery_charges ?? 0;
                    const creditCards = row.credit_cards ?? 0;
                    const debtors = row.debtors ?? 0;
                    const cashBanked = row.cash_banked ?? 0;
                    // Daily Banking = Turnover - Discounts + Del Charges - CC - Debtors
                    // (Online payments not included in history — would need separate query)
                    const dailyBanking =
                      turnover - discounts + delCharges - creditCards - debtors;
                    const variance = dailyBanking - cashBanked;

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-base-100 ${
                          idx % 2 === 1 ? "bg-base-50" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 text-base-900 whitespace-nowrap">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-base-700 hidden sm:table-cell">
                          {row.gross_turnover != null
                            ? formatCurrency(row.gross_turnover)
                            : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-base-700 hidden md:table-cell">
                          {row.cash_banked != null
                            ? formatCurrency(row.cash_banked)
                            : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono hidden md:table-cell">
                          {variance === 0 ? (
                            <span className="text-base-300">—</span>
                          ) : (
                            <span className="text-red-600">{formatCurrency(variance)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.status === "submitted"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {row.status === "submitted"
                              ? "Submitted"
                              : "Draft"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLoad(row.date)}
                          >
                            <Eye size={14} />
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Status banner ────────────────────────────────────────────── */}
      {loaded && status === "aura" && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 mb-6">
          <CloudDownload size={18} className="text-green-600 shrink-0" />
          <span className="text-sm text-green-800">
            Aura POS data loaded for{" "}
            <span className="font-semibold">{date}</span>
          </span>
        </div>
      )}

      {loaded && status === "manual" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-6">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            No Aura data — enter manually
          </span>
        </div>
      )}

      {loaded && status === "submitted" && (
        <div className="flex items-center justify-between rounded-lg bg-gray-100 border border-gray-200 px-4 py-3 mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <span className="text-sm text-gray-700 font-medium">
              Already submitted
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLoaded(false)}
            >
              Back to List
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUnlock}
              disabled={isPending}
            >
              <Pencil size={14} />
              Edit
            </Button>
          </div>
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────── */}
      {loaded && (
        <CashupForm
          key={formKey}
          branchId={branchId}
          date={date}
          existingCashup={cashup}
          auraImport={auraImport}
          drivers={drivers}
          channels={channels}
          readOnly={status === "submitted"}
          rosteredStaff={rosteredStaff}
          tenantId={tenantId}
        />
      )}

      {/* ── Empty state (no branch selected) ────────────────────────── */}
      {!loaded && !isPending && !branchId && (
        <div className="text-center py-16 text-base-400">
          <p className="text-sm">
            Select a branch and date, then click Load to begin.
          </p>
        </div>
      )}

      {!loaded && isPending && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      )}
    </PageShell>
  );
}
