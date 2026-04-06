"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EXPENSE_CATEGORIES = [
  "Cleaning",
  "Maintenance",
  "Uniforms",
  "Stationery",
  "Other",
] as const;

export interface ExpenseItem {
  category: string | null;
  description: string | null;
  amount: number | null;
}

interface ExpenseListProps {
  expenses: ExpenseItem[];
  onChange: (expenses: ExpenseItem[]) => void;
  readOnly?: boolean;
}

export function ExpenseList({ expenses, onChange, readOnly }: ExpenseListProps) {
  function addExpense() {
    onChange([...expenses, { category: "Cleaning", description: "", amount: null }]);
  }

  function removeExpense(index: number) {
    onChange(expenses.filter((_, i) => i !== index));
  }

  function updateExpense(index: number, field: keyof ExpenseItem, value: string | number | null) {
    const updated = expenses.map((exp, i) => {
      if (i !== index) return exp;
      return { ...exp, [field]: value };
    });
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {expenses.map((expense, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            className="h-9 rounded-lg border border-base-200 bg-surface px-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 min-w-[120px]"
            value={expense.category ?? "Other"}
            onChange={(e) => updateExpense(index, "category", e.target.value)}
            disabled={readOnly}
          >
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <Input
            compact
            placeholder="Description"
            value={expense.description ?? ""}
            onChange={(e) => updateExpense(index, "description", e.target.value)}
            className="flex-1 min-w-0"
            disabled={readOnly}
          />

          <Input
            compact
            currency
            type="number"
            step="0.01"
            placeholder="0.00"
            value={expense.amount ?? ""}
            onChange={(e) =>
              updateExpense(
                index,
                "amount",
                e.target.value === "" ? null : parseFloat(e.target.value)
              )
            }
            className="w-28"
            disabled={readOnly}
          />

          {!readOnly && (
            <button
              type="button"
              onClick={() => removeExpense(index)}
              className="shrink-0 p-1.5 rounded-md text-base-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label="Remove expense"
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
          onClick={addExpense}
          className="mt-1"
        >
          <Plus size={14} />
          Add Expense
        </Button>
      )}
    </div>
  );
}
