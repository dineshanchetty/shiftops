"use client";

import { useState } from "react";
import { AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpenseItem } from "./expense-list";

export interface SummaryValues {
  gross_turnover: number | null;
  discounts: number | null;
  delivery_charges: number | null;
  credit_cards: number | null;
  debtors: number | null;
  online_payments: { channel: string; amount: number | null }[];
  expenses: ExpenseItem[];
  cash_banked: number | null;
}

interface SummaryPanelProps {
  values: SummaryValues;
}

function n(val: number | null | undefined): number {
  return val ?? 0;
}

function formatR(amount: number): string {
  const prefix = amount < 0 ? "-R " : "R ";
  return `${prefix}${Math.abs(amount).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function SummaryPanel({ values }: SummaryPanelProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const onlineTotal = values.online_payments.reduce(
    (sum, p) => sum + n(p.amount),
    0
  );
  const expenseTotal = values.expenses.reduce(
    (sum, e) => sum + n(e.amount),
    0
  );

  // Daily Banking formula (matches legacy Blue Lounge system):
  // Gross Turnover - Discounts + Delivery Charges - Credit Cards - Debtors - Online Payments - Expenses
  // NOTE: Delivery Charges are ADDED because they are income received from customers
  const dailyBanking =
    n(values.gross_turnover) -
    n(values.discounts) +
    n(values.delivery_charges) -
    n(values.credit_cards) -
    n(values.debtors) -
    onlineTotal -
    expenseTotal;

  const cashBanked = n(values.cash_banked);
  const variance = dailyBanking - cashBanked;
  const hasVarianceWarning = Math.abs(variance) > 50;

  const content = (
    <div className="space-y-3">
      <SummaryRow label="Gross Turnover" value={n(values.gross_turnover)} />
      <SummaryRow
        label="Less: Discounts"
        value={-n(values.discounts)}
        indent
      />
      <SummaryRow
        label="Delivery Charges"
        value={n(values.delivery_charges)}
        indent
      />
      <SummaryRow
        label="Less: Credit Cards"
        value={-n(values.credit_cards)}
        indent
      />
      <SummaryRow
        label="Less: Debtors"
        value={-n(values.debtors)}
        indent
      />
      <SummaryRow
        label="Less: Online Payments"
        value={-onlineTotal}
        indent
      />
      <SummaryRow
        label="Total Expenses"
        value={-expenseTotal}
        indent
      />

      <div className="border-t border-base-200 pt-3">
        <SummaryRow label="= Daily Banking" value={dailyBanking} bold />
      </div>

      <div className="border-t border-base-200 pt-3">
        <SummaryRow label="Cash Banked" value={cashBanked} />
      </div>

      <div
        className={cn(
          "rounded-lg p-3 -mx-1",
          hasVarianceWarning ? "bg-red-50" : "bg-green-50"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {hasVarianceWarning && (
              <AlertTriangle size={14} className="text-red-600" />
            )}
            Variance
          </span>
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              hasVarianceWarning
                ? "text-red-600"
                : "text-green-600"
            )}
          >
            {formatR(variance)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: sticky right panel */}
      <div className="hidden md:block w-80 shrink-0">
        <div className="sticky top-4">
          <div className="rounded-xl bg-white shadow-sm p-4">
            <h3
              className="text-sm font-semibold text-base-900 mb-4 uppercase tracking-wide"
              style={{ fontFamily: 'var(--font-display, "Sora", sans-serif)' }}
            >
              Summary
            </h3>
            {content}
          </div>
        </div>
      </div>

      {/* Mobile: collapsible bottom drawer */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        <div className="bg-white rounded-t-xl shadow-lg border-t border-base-200">
          <button
            type="button"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="text-sm font-semibold text-base-900">
              Summary
            </span>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "font-mono text-sm font-semibold",
                  hasVarianceWarning ? "text-red-600" : "text-green-600"
                )}
              >
                Var: {formatR(variance)}
              </span>
              {mobileExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronUp size={16} />
              )}
            </div>
          </button>
          {mobileExpanded && (
            <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
              {content}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Summary row ──────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  bold,
  indent,
}: {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "text-sm",
          bold ? "font-semibold text-base-900" : "text-base-600",
          indent && "pl-2"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm",
          bold && "font-semibold",
          value < 0 ? "text-red-600" : value > 0 ? "text-green-600" : "text-base-600"
        )}
      >
        {formatR(value)}
      </span>
    </div>
  );
}
