/** The ShiftOps fields that can be mapped from Aura CSV columns. */
export const SHIFTOPS_FIELDS = [
  { name: "gross_turnover", label: "Gross Turnover" },
  { name: "discounts", label: "Discounts" },
  { name: "delivery_charges", label: "Delivery Charges" },
  { name: "credit_cards", label: "Credit Cards" },
  { name: "debtors", label: "Debtors" },
  { name: "stock_take", label: "Stock Take" },
  { name: "drinks_stock_take", label: "Drinks Stock Take" },
  { name: "tx_count", label: "Transaction Count" },
  { name: "tx_collect", label: "Collect Transactions" },
  { name: "tx_delivery", label: "Delivery Transactions" },
  { name: "online_uber_eats", label: "Uber Eats" },
  { name: "online_mr_d", label: "Mr D Food" },
  { name: "online_bolt_food", label: "Bolt Food" },
  { name: "online_order_in", label: "OrderIn" },
] as const;

export type ShiftOpsFieldName = (typeof SHIFTOPS_FIELDS)[number]["name"];

export interface FieldMapping {
  shiftops_field: string;
  csv_column: string;
}
