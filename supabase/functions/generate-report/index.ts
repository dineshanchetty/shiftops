import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Generate Report — Edge Function
 *
 * Server-side report generation returning HTML formatted for print/PDF.
 * Accepts POST requests with report parameters and returns an HTML document
 * that the client can render in a new tab or convert to PDF via browser print.
 *
 * Supported report types:
 *   - daily-banking
 *   - monthly-summary
 *   - wages-vs-turnover
 *   - driver-report
 *   - delivery-cost
 *   - online-payments
 *   - global-turnover
 *   - aura-inconsistency
 */

interface ReportRequest {
  reportType: string;
  branchIds: string[];
  startDate: string;
  endDate: string;
  tenantId: string;
}

const VALID_REPORT_TYPES = [
  "daily-banking",
  "monthly-summary",
  "wages-vs-turnover",
  "driver-report",
  "delivery-cost",
  "online-payments",
  "global-turnover",
  "aura-inconsistency",
] as const;

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    // Create client with the user's JWT for RLS enforcement
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify user and extract tenant
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: ReportRequest = await req.json();
    const { reportType, branchIds, startDate, endDate, tenantId } = body;

    // Validate tenant matches JWT
    const userTenantId = user.user_metadata?.tenant_id;
    if (tenantId !== userTenantId) {
      return new Response(JSON.stringify({ error: "Tenant mismatch — access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate report type
    if (!VALID_REPORT_TYPES.includes(reportType as typeof VALID_REPORT_TYPES[number])) {
      return new Response(
        JSON.stringify({ error: `Invalid report type: ${reportType}`, validTypes: VALID_REPORT_TYPES }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate dates
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate branchIds
    if (!branchIds || !Array.isArray(branchIds) || branchIds.length === 0) {
      return new Response(JSON.stringify({ error: "At least one branchId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch branch names for the report header
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name, brand_id, brands(name)")
      .in("id", branchIds);

    // Generate report based on type
    let reportHtml = "";

    switch (reportType) {
      case "daily-banking":
        reportHtml = await generateDailyBanking(supabase, branchIds, startDate, endDate, branches);
        break;
      case "monthly-summary":
        reportHtml = await generateMonthlySummary(supabase, branchIds, startDate, endDate, branches);
        break;
      case "wages-vs-turnover":
        reportHtml = await generateWagesVsTurnover(supabase, branchIds, startDate, endDate, branches);
        break;
      case "driver-report":
        reportHtml = await generateDriverReport(supabase, branchIds, startDate, endDate, branches);
        break;
      case "delivery-cost":
        reportHtml = await generateDeliveryCost(supabase, branchIds, startDate, endDate, branches);
        break;
      case "online-payments":
        reportHtml = await generateOnlinePayments(supabase, branchIds, startDate, endDate, branches);
        break;
      case "global-turnover":
        reportHtml = await generateGlobalTurnover(supabase, branchIds, startDate, endDate, branches);
        break;
      case "aura-inconsistency":
        reportHtml = await generateAuraInconsistency(supabase, branchIds, startDate, endDate, branches);
        break;
    }

    return new Response(reportHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Report generation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ---------------------------------------------------------------------------
// Report HTML wrapper
// ---------------------------------------------------------------------------

function wrapReport(title: string, dateRange: string, branchNames: string[], bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — ShiftOps</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a2e; padding: 24px; font-size: 12px; }
    .header { border-bottom: 2px solid #6c5ce7; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 20px; font-weight: 700; color: #6c5ce7; }
    .header .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
    tr:hover td { background: #f8fafc; }
    .total-row td { font-weight: 700; border-top: 2px solid #e2e8f0; background: #f8fafc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .section-title { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: #334155; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">
      Period: ${dateRange} | Branches: ${branchNames.join(", ")} | Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")}
    </div>
  </div>
  ${bodyContent}
  <div class="footer">Generated by ShiftOps &mdash; Franchise Operations Platform</div>
</body>
</html>`;
}

function formatCurrency(val: number): string {
  return `R ${val.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBranchNames(branches: any[] | null): string[] {
  return branches?.map((b: any) => b.name) ?? [];
}

// ---------------------------------------------------------------------------
// Report generators
// ---------------------------------------------------------------------------

async function generateDailyBanking(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: cashups } = await supabase
    .from("daily_cashups")
    .select("*")
    .in("branch_id", branchIds)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  let rows = "";
  let totalBanked = 0;
  let totalTurnover = 0;

  for (const c of cashups ?? []) {
    const branchName = branches?.find((b: any) => b.id === c.branch_id)?.name ?? "Unknown";
    totalBanked += Number(c.cash_banked ?? 0);
    totalTurnover += Number(c.gross_turnover ?? 0);
    rows += `<tr>
      <td>${c.date}</td>
      <td>${branchName}</td>
      <td class="text-right">${formatCurrency(c.gross_turnover ?? 0)}</td>
      <td class="text-right">${formatCurrency(c.credit_cards ?? 0)}</td>
      <td class="text-right">${formatCurrency(c.cash_banked ?? 0)}</td>
      <td class="text-right">${formatCurrency(c.cc_batch_total ?? 0)}</td>
      <td class="text-center">${c.status}</td>
    </tr>`;
  }

  rows += `<tr class="total-row">
    <td colspan="2">TOTALS</td>
    <td class="text-right">${formatCurrency(totalTurnover)}</td>
    <td></td>
    <td class="text-right">${formatCurrency(totalBanked)}</td>
    <td></td><td></td>
  </tr>`;

  const table = `<table>
    <thead><tr><th>Date</th><th>Branch</th><th>Gross Turnover</th><th>Credit Cards</th><th>Cash Banked</th><th>CC Batch</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Daily Banking Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateMonthlySummary(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: cashups } = await supabase
    .from("daily_cashups")
    .select("*")
    .in("branch_id", branchIds)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date");

  // Aggregate by branch
  const byBranch: Record<string, { turnover: number; banked: number; cards: number; days: number }> = {};
  for (const c of cashups ?? []) {
    if (!byBranch[c.branch_id]) byBranch[c.branch_id] = { turnover: 0, banked: 0, cards: 0, days: 0 };
    byBranch[c.branch_id].turnover += Number(c.gross_turnover ?? 0);
    byBranch[c.branch_id].banked += Number(c.cash_banked ?? 0);
    byBranch[c.branch_id].cards += Number(c.credit_cards ?? 0);
    byBranch[c.branch_id].days += 1;
  }

  let rows = "";
  for (const [bid, agg] of Object.entries(byBranch)) {
    const name = branches?.find((b: any) => b.id === bid)?.name ?? "Unknown";
    rows += `<tr>
      <td>${name}</td>
      <td class="text-center">${agg.days}</td>
      <td class="text-right">${formatCurrency(agg.turnover)}</td>
      <td class="text-right">${formatCurrency(agg.cards)}</td>
      <td class="text-right">${formatCurrency(agg.banked)}</td>
      <td class="text-right">${formatCurrency(agg.days > 0 ? agg.turnover / agg.days : 0)}</td>
    </tr>`;
  }

  const table = `<table>
    <thead><tr><th>Branch</th><th>Days</th><th>Total Turnover</th><th>Total Cards</th><th>Total Cash Banked</th><th>Avg Daily Turnover</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Monthly Summary Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateWagesVsTurnover(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: cashups } = await supabase
    .from("daily_cashups")
    .select("*")
    .in("branch_id", branchIds)
    .gte("date", startDate)
    .lte("date", endDate);

  const { data: drivers } = await supabase
    .from("cashup_driver_entries")
    .select("*, daily_cashups!inner(branch_id, date)")
    .in("daily_cashups.branch_id", branchIds)
    .gte("daily_cashups.date", startDate)
    .lte("daily_cashups.date", endDate);

  // Sum wages by branch
  const wagesByBranch: Record<string, number> = {};
  for (const d of drivers ?? []) {
    const bid = d.daily_cashups?.branch_id;
    if (bid) wagesByBranch[bid] = (wagesByBranch[bid] ?? 0) + Number(d.wages ?? 0);
  }

  const turnoverByBranch: Record<string, number> = {};
  for (const c of cashups ?? []) {
    turnoverByBranch[c.branch_id] = (turnoverByBranch[c.branch_id] ?? 0) + Number(c.gross_turnover ?? 0);
  }

  let rows = "";
  for (const bid of Object.keys(turnoverByBranch)) {
    const name = branches?.find((b: any) => b.id === bid)?.name ?? "Unknown";
    const turnover = turnoverByBranch[bid] ?? 0;
    const wages = wagesByBranch[bid] ?? 0;
    const pct = turnover > 0 ? ((wages / turnover) * 100).toFixed(1) : "N/A";
    rows += `<tr>
      <td>${name}</td>
      <td class="text-right">${formatCurrency(turnover)}</td>
      <td class="text-right">${formatCurrency(wages)}</td>
      <td class="text-right">${pct}%</td>
    </tr>`;
  }

  const table = `<table>
    <thead><tr><th>Branch</th><th>Turnover</th><th>Wages</th><th>Wages %</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Wages vs Turnover Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateDriverReport(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: drivers } = await supabase
    .from("cashup_driver_entries")
    .select("*, staff(first_name, last_name), daily_cashups!inner(branch_id, date)")
    .in("daily_cashups.branch_id", branchIds)
    .gte("daily_cashups.date", startDate)
    .lte("daily_cashups.date", endDate);

  let rows = "";
  for (const d of drivers ?? []) {
    const name = d.staff ? `${d.staff.first_name} ${d.staff.last_name}` : "Unknown";
    rows += `<tr>
      <td>${d.daily_cashups?.date ?? ""}</td>
      <td>${name}</td>
      <td class="text-right">${formatCurrency(d.turnover ?? 0)}</td>
      <td class="text-right">${formatCurrency(d.wages ?? 0)}</td>
      <td class="text-center">${d.delivery_count ?? 0}</td>
      <td class="text-right">${formatCurrency(d.fuel_cost ?? 0)}</td>
      <td class="text-right">${formatCurrency(d.gratuities ?? 0)}</td>
    </tr>`;
  }

  const table = `<table>
    <thead><tr><th>Date</th><th>Driver</th><th>Turnover</th><th>Wages</th><th>Deliveries</th><th>Fuel</th><th>Gratuities</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Driver Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateDeliveryCost(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: drivers } = await supabase
    .from("cashup_driver_entries")
    .select("*, daily_cashups!inner(branch_id, date)")
    .in("daily_cashups.branch_id", branchIds)
    .gte("daily_cashups.date", startDate)
    .lte("daily_cashups.date", endDate);

  // Aggregate delivery costs by branch
  const byBranch: Record<string, { deliveries: number; wages: number; fuel: number; charges: number }> = {};
  for (const d of drivers ?? []) {
    const bid = d.daily_cashups?.branch_id;
    if (!bid) continue;
    if (!byBranch[bid]) byBranch[bid] = { deliveries: 0, wages: 0, fuel: 0, charges: 0 };
    byBranch[bid].deliveries += d.delivery_count ?? 0;
    byBranch[bid].wages += Number(d.wages ?? 0);
    byBranch[bid].fuel += Number(d.fuel_cost ?? 0);
    byBranch[bid].charges += Number(d.charges ?? 0);
  }

  let rows = "";
  for (const [bid, agg] of Object.entries(byBranch)) {
    const name = branches?.find((b: any) => b.id === bid)?.name ?? "Unknown";
    const costPerDelivery = agg.deliveries > 0 ? (agg.wages + agg.fuel) / agg.deliveries : 0;
    rows += `<tr>
      <td>${name}</td>
      <td class="text-center">${agg.deliveries}</td>
      <td class="text-right">${formatCurrency(agg.wages)}</td>
      <td class="text-right">${formatCurrency(agg.fuel)}</td>
      <td class="text-right">${formatCurrency(agg.charges)}</td>
      <td class="text-right">${formatCurrency(costPerDelivery)}</td>
    </tr>`;
  }

  const table = `<table>
    <thead><tr><th>Branch</th><th>Total Deliveries</th><th>Driver Wages</th><th>Fuel</th><th>Charges</th><th>Cost/Delivery</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Delivery Cost Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateOnlinePayments(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: payments } = await supabase
    .from("cashup_online_payments")
    .select("*, daily_cashups!inner(branch_id, date)")
    .in("daily_cashups.branch_id", branchIds)
    .gte("daily_cashups.date", startDate)
    .lte("daily_cashups.date", endDate);

  // Aggregate by channel
  const byChannel: Record<string, number> = {};
  let total = 0;
  for (const p of payments ?? []) {
    const amt = Number(p.amount ?? 0);
    byChannel[p.channel] = (byChannel[p.channel] ?? 0) + amt;
    total += amt;
  }

  let rows = "";
  for (const [channel, amount] of Object.entries(byChannel).sort((a, b) => b[1] - a[1])) {
    const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : "0";
    rows += `<tr>
      <td>${channel}</td>
      <td class="text-right">${formatCurrency(amount)}</td>
      <td class="text-right">${pct}%</td>
    </tr>`;
  }

  rows += `<tr class="total-row"><td>TOTAL</td><td class="text-right">${formatCurrency(total)}</td><td></td></tr>`;

  const table = `<table>
    <thead><tr><th>Channel</th><th>Total Amount</th><th>% of Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Online Payments Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateGlobalTurnover(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  const { data: cashups } = await supabase
    .from("daily_cashups")
    .select("*")
    .in("branch_id", branchIds)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date");

  // Group by date across all branches
  const byDate: Record<string, number> = {};
  let grandTotal = 0;
  for (const c of cashups ?? []) {
    const amt = Number(c.gross_turnover ?? 0);
    byDate[c.date] = (byDate[c.date] ?? 0) + amt;
    grandTotal += amt;
  }

  let rows = "";
  for (const [date, total] of Object.entries(byDate).sort()) {
    rows += `<tr><td>${date}</td><td class="text-right">${formatCurrency(total)}</td></tr>`;
  }
  rows += `<tr class="total-row"><td>GRAND TOTAL</td><td class="text-right">${formatCurrency(grandTotal)}</td></tr>`;

  const table = `<table>
    <thead><tr><th>Date</th><th>Combined Turnover</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Global Turnover Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}

async function generateAuraInconsistency(supabase: any, branchIds: string[], startDate: string, endDate: string, branches: any) {
  // Fetch cashups that have an aura import linked
  const { data: cashups } = await supabase
    .from("daily_cashups")
    .select("*, aura_imports(raw_data)")
    .in("branch_id", branchIds)
    .gte("date", startDate)
    .lte("date", endDate)
    .not("aura_import_id", "is", null)
    .order("date");

  let rows = "";
  let flagCount = 0;

  for (const c of cashups ?? []) {
    const auraData = c.aura_imports?.raw_data;
    if (!auraData) continue;

    const auraTurnover = Number(auraData.gross_turnover ?? 0);
    const manualTurnover = Number(c.gross_turnover ?? 0);
    const variance = manualTurnover - auraTurnover;
    const variancePct = auraTurnover > 0 ? ((variance / auraTurnover) * 100).toFixed(1) : "N/A";
    const flagged = Math.abs(variance) > 100;
    if (flagged) flagCount++;

    const branchName = branches?.find((b: any) => b.id === c.branch_id)?.name ?? "Unknown";
    rows += `<tr style="${flagged ? "background:#fef2f2;" : ""}">
      <td>${c.date}</td>
      <td>${branchName}</td>
      <td class="text-right">${formatCurrency(auraTurnover)}</td>
      <td class="text-right">${formatCurrency(manualTurnover)}</td>
      <td class="text-right" style="${flagged ? "color:#dc2626;font-weight:700;" : ""}">${formatCurrency(variance)}</td>
      <td class="text-right">${variancePct}%</td>
    </tr>`;
  }

  const summary = `<p class="section-title">Flagged inconsistencies (>R100 variance): ${flagCount}</p>`;

  const table = `${summary}<table>
    <thead><tr><th>Date</th><th>Branch</th><th>Aura Turnover</th><th>Manual Turnover</th><th>Variance</th><th>Variance %</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return wrapReport("Aura Inconsistency Report", `${startDate} to ${endDate}`, getBranchNames(branches), table);
}
