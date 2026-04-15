"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  DailyCashup,
  CashupOnlinePayment,
  CashupDriverEntry,
  CashupExpense,
  CashupPurchase,
  AuraImport,
  Staff,
} from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashupWithRelations extends DailyCashup {
  online_payments: CashupOnlinePayment[];
  driver_entries: (CashupDriverEntry & {
    staff: Pick<Staff, "id" | "first_name" | "last_name"> | null;
  })[];
  expenses: CashupExpense[];
  purchases: CashupPurchase[];
}

export interface DriverFromRoster {
  staff_id: string;
  first_name: string;
  last_name: string;
}

export interface RosteredStaffEntry {
  staff_id: string;
  first_name: string;
  last_name: string;
  position_name: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_hours: number | null;
  is_off: boolean;
}

export interface SaveCashupInput {
  id?: string;
  branch_id: string;
  date: string;
  gross_turnover: number | null;
  discounts: number | null;
  delivery_charges: number | null;
  credit_cards: number | null;
  debtors: number | null;
  stock_take: number | null;
  drinks_stock_take: number | null;
  cash_banked: number | null;
  cc_batch_total: number | null;
  shop_float: number | null;
  tx_count: number | null;
  tx_collect: number | null;
  tx_delivery: number | null;
  comment: string | null;
  aura_import_id: string | null;
  online_payments: { channel: string; amount: number | null }[];
  driver_entries: {
    staff_id: string;
    turnover: number | null;
    wages: number | null;
    charges: number | null;
    delivery_count: number | null;
    fuel_cost: number | null;
    gratuities: number | null;
  }[];
  expenses: {
    category: string | null;
    description: string | null;
    amount: number | null;
  }[];
  purchases: {
    item_type: string | null;
    amount: number | null;
  }[];
}

// ─── Load existing cashup ─────────────────────────────────────────────────────

export async function loadCashup(
  branchId: string,
  date: string
): Promise<CashupWithRelations | null> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return null;

  const { data: cashup } = await supabase
    .from("daily_cashups")
    .select("*")
    .eq("branch_id", branchId)
    .eq("date", date)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!cashup) return null;

  // Fetch child records in parallel
  const [paymentsRes, driversRes, expensesRes, purchasesRes] =
    await Promise.all([
      supabase
        .from("cashup_online_payments")
        .select("*")
        .eq("cashup_id", cashup.id),
      supabase
        .from("cashup_driver_entries")
        .select("*, staff:staff(id, first_name, last_name)")
        .eq("cashup_id", cashup.id),
      supabase
        .from("cashup_expenses")
        .select("*")
        .eq("cashup_id", cashup.id),
      supabase
        .from("cashup_purchases")
        .select("*")
        .eq("cashup_id", cashup.id),
    ]);

  return {
    ...cashup,
    online_payments: paymentsRes.data ?? [],
    driver_entries: (driversRes.data ?? []) as CashupWithRelations["driver_entries"],
    expenses: expensesRes.data ?? [],
    purchases: purchasesRes.data ?? [],
  };
}

// ─── Check Aura import ────────────────────────────────────────────────────────

export async function checkAuraImport(
  branchId: string,
  date: string
): Promise<AuraImport | null> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return null;

  const { data } = await supabase
    .from("aura_imports")
    .select("*")
    .eq("branch_id", branchId)
    .eq("import_date", date)
    .eq("tenant_id", tenantId)
    .eq("status", "parsed")
    .maybeSingle();

  return data ?? null;
}

// ─── Get drivers from roster ──────────────────────────────────────────────────

export async function getDriversFromRoster(
  branchId: string,
  date: string
): Promise<DriverFromRoster[]> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return [];

  // First get the Driver position ID
  const { data: driverPosition } = await supabase
    .from("positions")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", "%driver%")
    .maybeSingle();

  if (!driverPosition) return [];

  // Get roster entries for drivers on this date
  const { data: rosterEntries } = await supabase
    .from("roster_entries")
    .select("staff:staff(id, first_name, last_name, position_id)")
    .eq("branch_id", branchId)
    .eq("date", date)
    .eq("tenant_id", tenantId)
    .neq("is_off", true);

  if (!rosterEntries) return [];

  // Filter to only driver staff and deduplicate
  const seen = new Set<string>();
  const drivers: DriverFromRoster[] = [];

  for (const entry of rosterEntries) {
    const staff = entry.staff as unknown as Pick<Staff, "id" | "first_name" | "last_name" | "position_id"> | null;
    if (!staff) continue;
    if (staff.position_id !== driverPosition.id) continue;
    if (seen.has(staff.id)) continue;
    seen.add(staff.id);
    drivers.push({
      staff_id: staff.id,
      first_name: staff.first_name,
      last_name: staff.last_name,
    });
  }

  // Fallback: if no drivers rostered for this date, show all active driver staff
  // so the manager can still enter driver data for the cashup
  if (drivers.length === 0) {
    const { data: allDriverStaff } = await supabase
      .from("staff")
      .select("id, first_name, last_name")
      .eq("branch_id", branchId)
      .eq("tenant_id", tenantId)
      .eq("position_id", driverPosition.id)
      .eq("active", true)
      .order("first_name");

    if (allDriverStaff) {
      for (const s of allDriverStaff) {
        drivers.push({
          staff_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
        });
      }
    }
  }

  return drivers;
}

// ─── Get payment channels for branch ──────────────────────────────────────────

export async function getPaymentChannels(
  branchId: string
): Promise<{ channel_name: string }[]> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return [];

  const { data } = await supabase
    .from("branch_payment_channels")
    .select("channel_name")
    .eq("branch_id", branchId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");

  return data ?? [];
}

// ─── Get branches for user ────────────────────────────────────────────────────

export async function getUserBranches(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return [];

  const { data: branchIds } = await supabase.rpc("get_user_branch_ids");

  let query = supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");

  // If user has specific branch access, filter
  if (branchIds && branchIds.length > 0) {
    query = query.in("id", branchIds);
  }

  const { data } = await query;
  return data ?? [];
}

// ─── Get tenant ID ────────────────────────────────────────────────────────────

export async function getUserTenantId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_user_tenant_id");
  return data ?? "";
}

// ─── Save cashup ──────────────────────────────────────────────────────────────

export async function saveCashup(input: SaveCashupInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { success: false, error: "No tenant found" };

  const cashupRow = {
    branch_id: input.branch_id,
    date: input.date,
    tenant_id: tenantId,
    gross_turnover: input.gross_turnover,
    discounts: input.discounts,
    delivery_charges: input.delivery_charges,
    credit_cards: input.credit_cards,
    debtors: input.debtors,
    stock_take: input.stock_take,
    drinks_stock_take: input.drinks_stock_take,
    cash_banked: input.cash_banked,
    cc_batch_total: input.cc_batch_total,
    shop_float: input.shop_float,
    tx_count: input.tx_count,
    tx_collect: input.tx_collect,
    tx_delivery: input.tx_delivery,
    comment: input.comment,
    aura_import_id: input.aura_import_id,
    status: "draft" as const,
  };

  let cashupId = input.id;

  if (cashupId) {
    // Update existing
    const { error } = await supabase
      .from("daily_cashups")
      .update(cashupRow)
      .eq("id", cashupId);
    if (error) return { success: false, error: error.message };
  } else {
    // Insert new
    const { data, error } = await supabase
      .from("daily_cashups")
      .insert({ ...cashupRow, created_by: user.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    cashupId = data.id;
  }

  // ─── Upsert child records ────────────────────────────────────────────

  // Online payments: delete + re-insert
  await supabase
    .from("cashup_online_payments")
    .delete()
    .eq("cashup_id", cashupId);

  if (input.online_payments.length > 0) {
    const paymentRows = input.online_payments
      .filter((p) => p.amount !== null && p.amount !== 0)
      .map((p) => ({
        cashup_id: cashupId!,
        channel: p.channel,
        amount: p.amount,
      }));
    if (paymentRows.length > 0) {
      await supabase.from("cashup_online_payments").insert(paymentRows);
    }
  }

  // Driver entries: delete + re-insert
  await supabase
    .from("cashup_driver_entries")
    .delete()
    .eq("cashup_id", cashupId);

  if (input.driver_entries.length > 0) {
    const driverRows = input.driver_entries.map((d) => ({
      cashup_id: cashupId!,
      staff_id: d.staff_id,
      turnover: d.turnover,
      wages: d.wages,
      charges: d.charges,
      delivery_count: d.delivery_count,
      fuel_cost: d.fuel_cost,
      gratuities: d.gratuities,
    }));
    await supabase.from("cashup_driver_entries").insert(driverRows);
  }

  // Expenses: delete + re-insert
  await supabase.from("cashup_expenses").delete().eq("cashup_id", cashupId);

  if (input.expenses.length > 0) {
    const expenseRows = input.expenses
      .filter((e) => e.amount !== null && e.amount !== 0)
      .map((e) => ({
        cashup_id: cashupId!,
        category: e.category,
        description: e.description,
        amount: e.amount,
      }));
    if (expenseRows.length > 0) {
      await supabase.from("cashup_expenses").insert(expenseRows);
    }
  }

  // Purchases: delete + re-insert
  await supabase.from("cashup_purchases").delete().eq("cashup_id", cashupId);

  if (input.purchases.length > 0) {
    const purchaseRows = input.purchases
      .filter((p) => p.amount !== null && p.amount !== 0)
      .map((p) => ({
        cashup_id: cashupId!,
        item_type: p.item_type,
        amount: p.amount,
      }));
    if (purchaseRows.length > 0) {
      await supabase.from("cashup_purchases").insert(purchaseRows);
    }
  }

  return { success: true, cashupId };
}

// ─── Submit cashup ────────────────────────────────────────────────────────────

export async function submitCashup(cashupId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("daily_cashups")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", cashupId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Get ALL rostered staff for attendance ───────────────────────────────────

export async function getRosteredStaff(
  branchId: string,
  date: string
): Promise<RosteredStaffEntry[]> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return [];

  // Get all roster entries for this branch + date, with staff and position info
  const { data: rosterEntries } = await supabase
    .from("roster_entries")
    .select("*, staff:staff(id, first_name, last_name, position_id, position:positions(name))")
    .eq("branch_id", branchId)
    .eq("date", date)
    .eq("tenant_id", tenantId);

  if (!rosterEntries) return [];

  const seen = new Set<string>();
  const result: RosteredStaffEntry[] = [];

  for (const entry of rosterEntries) {
    const staff = entry.staff as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      position_id: string | null;
      position: { name: string } | null;
    } | null;

    if (!staff) continue;
    if (seen.has(staff.id)) continue;
    seen.add(staff.id);

    result.push({
      staff_id: staff.id,
      first_name: staff.first_name,
      last_name: staff.last_name,
      position_name: staff.position?.name ?? null,
      shift_start: entry.shift_start,
      shift_end: entry.shift_end,
      shift_hours: entry.shift_hours,
      is_off: entry.is_off ?? false,
    });
  }

  return result;
}

// ─── Get cashup history for branch ───────────────────────────────────────────

export interface CashupHistoryRow {
  id: string;
  date: string;
  gross_turnover: number | null;
  cash_banked: number | null;
  discounts: number | null;
  delivery_charges: number | null;
  credit_cards: number | null;
  debtors: number | null;
  status: string | null;
  submitted_at: string | null;
}

export async function getCashupHistory(
  branchId: string,
  limit: number = 14
): Promise<CashupHistoryRow[]> {
  const supabase = await createClient();

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return [];

  const { data } = await supabase
    .from("daily_cashups")
    .select(
      "id, date, gross_turnover, cash_banked, discounts, delivery_charges, credit_cards, debtors, status, submitted_at"
    )
    .eq("branch_id", branchId)
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false })
    .limit(limit);

  return (data ?? []) as CashupHistoryRow[];
}

// ─── Unlock cashup ────────────────────────────────────────────────────────────

export async function unlockCashup(cashupId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("daily_cashups")
    .update({
      status: "draft",
      submitted_at: null,
    })
    .eq("id", cashupId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
