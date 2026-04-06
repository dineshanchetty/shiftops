"use server";

import { createClient } from "@/lib/supabase/server";

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

/**
 * Save field mappings for the current tenant.
 * Upserts all mappings (deletes old ones and inserts new).
 */
export async function saveFieldMappings(mappings: FieldMapping[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) {
    return { success: false, error: "No tenant found" };
  }

  // Filter out empty mappings
  const validMappings = mappings.filter(
    (m) => m.csv_column && m.csv_column.trim() !== ""
  );

  // Delete existing mappings for this tenant
  const { error: deleteError } = await supabase
    .from("aura_field_mappings")
    .delete()
    .eq("tenant_id", tenantId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  if (validMappings.length === 0) {
    return { success: true, count: 0 };
  }

  // Insert new mappings
  const rows = validMappings.map((m) => ({
    tenant_id: tenantId,
    shiftops_field: m.shiftops_field,
    csv_column: m.csv_column.trim(),
  }));

  const { error: insertError } = await supabase
    .from("aura_field_mappings")
    .insert(rows);

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true, count: validMappings.length };
}

/**
 * Load existing field mappings for the current tenant.
 */
export async function loadFieldMappings(): Promise<FieldMapping[]> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return [];

  const { data } = await supabase
    .from("aura_field_mappings")
    .select("shiftops_field, csv_column")
    .eq("tenant_id", tenantId);

  return (data ?? []) as FieldMapping[];
}

/**
 * Parse a CSV file and return its column headers.
 * Used for the "auto-detect columns" feature.
 */
export async function parseSampleCsvHeaders(
  formData: FormData
): Promise<{ headers: string[] } | { error: string }> {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { error: "File is empty" };

  // Detect delimiter
  const tabCount = (text.match(/\t/g) || []).length;
  const commaCount = (text.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";

  // Parse first line as headers
  const headers = parseCsvLine(lines[0], delimiter);
  return { headers };
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}
