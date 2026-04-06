"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  AlertTriangle,
  CloudDownload,
  Loader2,
  Pencil,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { CashupForm } from "@/components/cashup/cashup-form";
import {
  loadCashup,
  checkAuraImport,
  getDriversFromRoster,
  getPaymentChannels,
  getUserBranches,
  unlockCashup,
  type CashupWithRelations,
  type DriverFromRoster,
} from "./actions";
import type { AuraImport } from "@/lib/types";

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
  const [status, setStatus] = useState<StatusBanner>(null);
  const [loaded, setLoaded] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // ─── Load branches on first mount ───────────────────────────────────
  useEffect(() => {
    if (branchesLoaded) return;
    startTransition(async () => {
      try {
        const b = await getUserBranches();
        setBranches(b);
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

  // ─── Load cashup data ──────────────────────────────────────────────
  const handleLoad = useCallback(() => {
    if (!branchId || !date) return;

    startTransition(async () => {
      const [cashupData, auraData, driverData, channelData] =
        await Promise.all([
          loadCashup(branchId, date),
          checkAuraImport(branchId, date),
          getDriversFromRoster(branchId, date),
          getPaymentChannels(branchId),
        ]);

      setCashup(cashupData);
      setAuraImport(auraData);
      setDrivers(driverData);
      setChannels(channelData);

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
  }, [branchId, date]);

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
          onClick={handleLoad}
          disabled={!branchId || !date || isPending}
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Load
        </Button>
      </div>

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
        />
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {!loaded && !isPending && (
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
