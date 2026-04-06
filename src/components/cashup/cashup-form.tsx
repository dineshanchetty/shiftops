"use client";

import { useState, useCallback, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DriverTable, type DriverEntryRow } from "./driver-table";
import { ExpenseList, type ExpenseItem } from "./expense-list";
import { PurchaseList, type PurchaseItem } from "./purchase-list";
import { SummaryPanel } from "./summary-panel";
import {
  saveCashup,
  submitCashup,
  type CashupWithRelations,
  type DriverFromRoster,
  type SaveCashupInput,
} from "@/app/app/cashup/actions";
import type { AuraImport } from "@/lib/types";

// ─── Channel display names ───────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  aura: "Aura",
  yumbi: "Yumbi",
  wi_group: "Wi-Group",
  mr_d: "Mr D",
  ubereats: "UberEats",
};

// ─── Tabs ────────────────────────────────────────────────────────────────────

type CashupTab = "takings" | "drivers" | "banking" | "purchases";

const TABS: { key: CashupTab; label: string }[] = [
  { key: "takings", label: "Takings" },
  { key: "drivers", label: "Drivers" },
  { key: "banking", label: "Banking" },
  { key: "purchases", label: "Purchases" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface CashupFormProps {
  branchId: string;
  date: string;
  existingCashup: CashupWithRelations | null;
  auraImport: AuraImport | null;
  drivers: DriverFromRoster[];
  channels: { channel_name: string }[];
  readOnly: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CashupForm({
  branchId,
  date,
  existingCashup,
  auraImport,
  drivers,
  channels,
  readOnly: initialReadOnly,
}: CashupFormProps) {
  const isAura = !!auraImport;
  const [isPending, startTransition] = useTransition();
  const [readOnly, setReadOnly] = useState(initialReadOnly);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<CashupTab>("takings");

  // ─── Form state ───────────────────────────────────────────────────────

  const [grossTurnover, setGrossTurnover] = useState<number | null>(
    existingCashup?.gross_turnover ?? null
  );
  const [discounts, setDiscounts] = useState<number | null>(
    existingCashup?.discounts ?? null
  );
  const [deliveryCharges, setDeliveryCharges] = useState<number | null>(
    existingCashup?.delivery_charges ?? null
  );
  const [creditCards, setCreditCards] = useState<number | null>(
    existingCashup?.credit_cards ?? null
  );
  const [debtors, setDebtors] = useState<number | null>(
    existingCashup?.debtors ?? null
  );
  const [stockTake, setStockTake] = useState<number | null>(
    existingCashup?.stock_take ?? null
  );
  const [drinksStockTake, setDrinksStockTake] = useState<number | null>(
    existingCashup?.drinks_stock_take ?? null
  );
  const [comment, setComment] = useState<string>(
    existingCashup?.comment ?? ""
  );

  // Banking
  const [cashBanked, setCashBanked] = useState<number | null>(
    existingCashup?.cash_banked ?? null
  );
  const [ccBatchTotal, setCcBatchTotal] = useState<number | null>(
    existingCashup?.cc_batch_total ?? null
  );
  const [shopFloat, setShopFloat] = useState<number | null>(
    existingCashup?.shop_float ?? null
  );

  // Transaction counts
  const [txCount, setTxCount] = useState<number | null>(
    existingCashup?.tx_count ?? null
  );
  const [txCollect, setTxCollect] = useState<number | null>(
    existingCashup?.tx_collect ?? null
  );
  const [txDelivery, setTxDelivery] = useState<number | null>(
    existingCashup?.tx_delivery ?? null
  );
  const [txLocked, setTxLocked] = useState(
    existingCashup?.tx_count != null
  );

  // Online payments — initialize from channels + existing data
  const [onlinePayments, setOnlinePayments] = useState(() => {
    const channelList =
      channels.length > 0
        ? channels.map((c) => c.channel_name)
        : Object.keys(CHANNEL_LABELS);

    return channelList.map((ch) => {
      const existing = existingCashup?.online_payments?.find(
        (p) => p.channel === ch
      );
      return {
        channel: ch,
        amount: existing?.amount ?? null,
      };
    });
  });

  // Driver entries — merge roster with existing data
  const [driverEntries, setDriverEntries] = useState<DriverEntryRow[]>(() => {
    const rosterEntries: DriverEntryRow[] = drivers.map((d) => {
      const existing = existingCashup?.driver_entries?.find(
        (e) => e.staff_id === d.staff_id
      );
      return {
        staff_id: d.staff_id,
        first_name: d.first_name,
        last_name: d.last_name,
        turnover: existing?.turnover ?? null,
        wages: existing?.wages ?? null,
        charges: existing?.charges ?? null,
        delivery_count: existing?.delivery_count ?? null,
        fuel_cost: existing?.fuel_cost ?? null,
        gratuities: existing?.gratuities ?? null,
        fromRoster: true,
      };
    });

    // Add any extra driver entries not from roster
    const rosterIds = new Set(drivers.map((d) => d.staff_id));
    const extraEntries: DriverEntryRow[] = (
      existingCashup?.driver_entries ?? []
    )
      .filter((e) => !rosterIds.has(e.staff_id))
      .map((e) => ({
        staff_id: e.staff_id,
        first_name: e.staff?.first_name ?? "",
        last_name: e.staff?.last_name ?? "",
        turnover: e.turnover,
        wages: e.wages,
        charges: e.charges,
        delivery_count: e.delivery_count,
        fuel_cost: e.fuel_cost,
        gratuities: e.gratuities,
        fromRoster: false,
      }));

    return [...rosterEntries, ...extraEntries];
  });

  // Expenses
  const [expenses, setExpenses] = useState<ExpenseItem[]>(
    existingCashup?.expenses?.map((e) => ({
      category: e.category,
      description: e.description,
      amount: e.amount,
    })) ?? []
  );

  // Purchases
  const [purchases, setPurchases] = useState<PurchaseItem[]>(
    existingCashup?.purchases?.map((p) => ({
      item_type: p.item_type,
      amount: p.amount,
    })) ?? []
  );

  // ─── Handlers ─────────────────────────────────────────────────────────

  const updatePayment = useCallback(
    (index: number, amount: number | null) => {
      setOnlinePayments((prev) =>
        prev.map((p, i) => (i === index ? { ...p, amount } : p))
      );
    },
    []
  );

  const handleSave = useCallback(() => {
    startTransition(async () => {
      const input: SaveCashupInput = {
        id: existingCashup?.id,
        branch_id: branchId,
        date,
        gross_turnover: grossTurnover,
        discounts,
        delivery_charges: deliveryCharges,
        credit_cards: creditCards,
        debtors,
        stock_take: stockTake,
        drinks_stock_take: drinksStockTake,
        cash_banked: cashBanked,
        cc_batch_total: ccBatchTotal,
        shop_float: shopFloat,
        tx_count: txCount,
        tx_collect: txCollect,
        tx_delivery: txDelivery,
        comment: comment || null,
        aura_import_id: auraImport?.id ?? null,
        online_payments: onlinePayments,
        driver_entries: driverEntries
          .filter((d) => d.staff_id)
          .map((d) => ({
            staff_id: d.staff_id,
            turnover: d.turnover,
            wages: d.wages,
            charges: d.charges,
            delivery_count: d.delivery_count,
            fuel_cost: d.fuel_cost,
            gratuities: d.gratuities,
          })),
        expenses,
        purchases,
      };

      const result = await saveCashup(input);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }, [
    existingCashup?.id,
    branchId,
    date,
    grossTurnover,
    discounts,
    deliveryCharges,
    creditCards,
    debtors,
    stockTake,
    drinksStockTake,
    cashBanked,
    ccBatchTotal,
    shopFloat,
    txCount,
    txCollect,
    txDelivery,
    comment,
    auraImport?.id,
    onlinePayments,
    driverEntries,
    expenses,
    purchases,
  ]);

  const handleSubmit = useCallback(() => {
    if (!existingCashup?.id) return;
    startTransition(async () => {
      // Save first, then submit
      const saveResult = await saveCashup({
        id: existingCashup.id,
        branch_id: branchId,
        date,
        gross_turnover: grossTurnover,
        discounts,
        delivery_charges: deliveryCharges,
        credit_cards: creditCards,
        debtors,
        stock_take: stockTake,
        drinks_stock_take: drinksStockTake,
        cash_banked: cashBanked,
        cc_batch_total: ccBatchTotal,
        shop_float: shopFloat,
        tx_count: txCount,
        tx_collect: txCollect,
        tx_delivery: txDelivery,
        comment: comment || null,
        aura_import_id: auraImport?.id ?? null,
        online_payments: onlinePayments,
        driver_entries: driverEntries
          .filter((d) => d.staff_id)
          .map((d) => ({
            staff_id: d.staff_id,
            turnover: d.turnover,
            wages: d.wages,
            charges: d.charges,
            delivery_count: d.delivery_count,
            fuel_cost: d.fuel_cost,
            gratuities: d.gratuities,
          })),
        expenses,
        purchases,
      });

      if (saveResult.success) {
        const submitResult = await submitCashup(
          saveResult.cashupId ?? existingCashup.id
        );
        if (submitResult.success) {
          setReadOnly(true);
        }
      }
    });
  }, [
    existingCashup?.id,
    branchId,
    date,
    grossTurnover,
    discounts,
    deliveryCharges,
    creditCards,
    debtors,
    stockTake,
    drinksStockTake,
    cashBanked,
    ccBatchTotal,
    shopFloat,
    txCount,
    txCollect,
    txDelivery,
    comment,
    auraImport?.id,
    onlinePayments,
    driverEntries,
    expenses,
    purchases,
  ]);

  // ─── Currency input helper ────────────────────────────────────────────

  const auraBg = isAura ? "bg-blue-50" : undefined;

  function currencyInput(
    label: string,
    value: number | null,
    setter: (v: number | null) => void,
    isAuraField?: boolean
  ) {
    return (
      <Input
        label={label}
        compact
        currency
        type="number"
        step="0.01"
        placeholder="0.00"
        value={value ?? ""}
        onChange={(e) =>
          setter(e.target.value === "" ? null : parseFloat(e.target.value))
        }
        disabled={readOnly}
        className={cn(isAuraField && isAura && auraBg)}
      />
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 items-start">
      {/* Main form */}
      <div className="flex-1 min-w-0 pb-32 md:pb-8">
        {/* ── Tab bar ───────────────────────────────────────────────── */}
        <div className="border-b border-base-200 mb-6">
          <nav className="flex gap-0" aria-label="Cashup tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Tab: Takings ──────────────────────────────────────────── */}
        <div className={activeTab === "takings" ? "block" : "hidden"}>
          <div className="space-y-5">
            {currencyInput(
              "Gross Turnover",
              grossTurnover,
              setGrossTurnover,
              true
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {currencyInput("Discounts", discounts, setDiscounts, true)}
              {currencyInput(
                "Delivery Charges",
                deliveryCharges,
                setDeliveryCharges,
                true
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {currencyInput("Credit Cards", creditCards, setCreditCards, true)}
              {currencyInput("Debtors", debtors, setDebtors, true)}
            </div>

            {/* Online Payments */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-base-700">
                Online Payments
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {onlinePayments.map((payment, index) => (
                  <Input
                    key={payment.channel}
                    label={
                      CHANNEL_LABELS[payment.channel] ?? payment.channel
                    }
                    compact
                    currency
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={payment.amount ?? ""}
                    onChange={(e) =>
                      updatePayment(
                        index,
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    disabled={readOnly}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {currencyInput(
                "Total Stock Take",
                stockTake,
                setStockTake,
                true
              )}
              {currencyInput(
                "Drinks Stock Take",
                drinksStockTake,
                setDrinksStockTake,
                true
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-base-700">
                Comment
              </label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-base-200 bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 min-h-[72px] resize-y"
                placeholder="Add any notes for this cashup..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        {/* ── Tab: Drivers ──────────────────────────────────────────── */}
        <div className={activeTab === "drivers" ? "block" : "hidden"}>
          <DriverTable
            drivers={drivers}
            entries={driverEntries}
            onChange={setDriverEntries}
            readOnly={readOnly}
          />
        </div>

        {/* ── Tab: Banking ──────────────────────────────────────────── */}
        <div className={activeTab === "banking" ? "block" : "hidden"}>
          <div className="space-y-6">
            {currencyInput("Cash Banked", cashBanked, setCashBanked)}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {currencyInput(
                "Credit Card Batch Total",
                ccBatchTotal,
                setCcBatchTotal
              )}
              {currencyInput("Shop Float", shopFloat, setShopFloat)}
            </div>

            {/* Transaction Counts */}
            <div className="border-t border-base-200 pt-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-4">
                Transaction Counts
              </h3>

              <div className="grid grid-cols-3 gap-5">
                <Input
                  label="Count"
                  compact
                  type="number"
                  step="1"
                  placeholder="0"
                  value={txCount ?? ""}
                  onChange={(e) =>
                    setTxCount(
                      e.target.value === ""
                        ? null
                        : parseInt(e.target.value, 10)
                    )
                  }
                  disabled={readOnly || txLocked}
                  className={cn(isAura && auraBg)}
                />
                <Input
                  label="Collect"
                  compact
                  type="number"
                  step="1"
                  placeholder="0"
                  value={txCollect ?? ""}
                  onChange={(e) =>
                    setTxCollect(
                      e.target.value === ""
                        ? null
                        : parseInt(e.target.value, 10)
                    )
                  }
                  disabled={readOnly || txLocked}
                  className={cn(isAura && auraBg)}
                />
                <Input
                  label="Delivery"
                  compact
                  type="number"
                  step="1"
                  placeholder="0"
                  value={txDelivery ?? ""}
                  onChange={(e) =>
                    setTxDelivery(
                      e.target.value === ""
                        ? null
                        : parseInt(e.target.value, 10)
                    )
                  }
                  disabled={readOnly || txLocked}
                  className={cn(isAura && auraBg)}
                />
              </div>

              {!readOnly && (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setTxLocked(!txLocked)}
                  >
                    <Lock size={14} />
                    {txLocked ? "Unlock Counts" : "Lock Counts"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab: Purchases ────────────────────────────────────────── */}
        <div className={activeTab === "purchases" ? "block" : "hidden"}>
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-4">
                Expenses
              </h3>
              <ExpenseList
                expenses={expenses}
                onChange={setExpenses}
                readOnly={readOnly}
              />
            </div>

            <div className="border-t border-base-200 pt-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-4">
                Purchases
              </h3>
              <PurchaseList
                purchases={purchases}
                onChange={setPurchases}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>

        {/* ── Actions ────────────────────────────────────────────────── */}
        {!readOnly && (
          <div className="border-t border-base-200 pt-6 mt-8 flex flex-col sm:flex-row sm:justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending && <Loader2 size={16} className="animate-spin" />}
              {saved ? "Saved!" : "Save Draft"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={isPending || !existingCashup?.id}
              className="w-full sm:w-auto"
            >
              {isPending && <Loader2 size={16} className="animate-spin" />}
              Submit Cashup
            </Button>
          </div>
        )}
      </div>

      {/* Summary panel — stays as sticky sidebar */}
      <SummaryPanel
        values={{
          gross_turnover: grossTurnover,
          discounts,
          delivery_charges: deliveryCharges,
          credit_cards: creditCards,
          debtors,
          online_payments: onlinePayments,
          expenses,
          cash_banked: cashBanked,
        }}
      />
    </div>
  );
}
