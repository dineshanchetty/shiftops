"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PURCHASE_TYPES = [
  "ABI Purchases",
  "Coca-Cola",
  "Supplier",
  "Other",
] as const;

export interface PurchaseItem {
  item_type: string | null;
  amount: number | null;
}

interface PurchaseListProps {
  purchases: PurchaseItem[];
  onChange: (purchases: PurchaseItem[]) => void;
  readOnly?: boolean;
}

export function PurchaseList({
  purchases,
  onChange,
  readOnly,
}: PurchaseListProps) {
  function addPurchase() {
    onChange([...purchases, { item_type: "ABI Purchases", amount: null }]);
  }

  function removePurchase(index: number) {
    onChange(purchases.filter((_, i) => i !== index));
  }

  function updatePurchase(
    index: number,
    field: keyof PurchaseItem,
    value: string | number | null
  ) {
    const updated = purchases.map((p, i) => {
      if (i !== index) return p;
      return { ...p, [field]: value };
    });
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {purchases.map((purchase, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            className="h-9 rounded-lg border border-base-200 bg-surface px-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 min-w-[140px]"
            value={purchase.item_type ?? "Other"}
            onChange={(e) => updatePurchase(index, "item_type", e.target.value)}
            disabled={readOnly}
          >
            {PURCHASE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <Input
            compact
            currency
            type="number"
            step="0.01"
            placeholder="0.00"
            value={purchase.amount ?? ""}
            onChange={(e) =>
              updatePurchase(
                index,
                "amount",
                e.target.value === "" ? null : parseFloat(e.target.value)
              )
            }
            className="flex-1 min-w-0"
            disabled={readOnly}
          />

          {!readOnly && (
            <button
              type="button"
              onClick={() => removePurchase(index)}
              className="shrink-0 p-1.5 rounded-md text-base-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label="Remove purchase"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addPurchase}
          className="mt-1"
        >
          <Plus size={14} />
          Add Purchase
        </Button>
      )}
    </div>
  );
}
