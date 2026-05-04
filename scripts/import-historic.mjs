#!/usr/bin/env node
/**
 * Historic Data Import — Turnover & Payroll PDFs → daily_cashups + roster_entries
 *
 * Three modes:
 *   --list                   → print branches + PDF inventory + unknown staff (read-only)
 *   --dry-run                → parse all PDFs, print summary, write /tmp/import-dryrun.json
 *   --apply                  → actually write to DB
 *
 * Optional flags:
 *   --branch "DEB MP"        → restrict to one branch prefix
 *   --type turnover|payroll  → restrict to one PDF type
 *   --pdf <filename>         → process one PDF only (debug)
 *
 * Environment (read from $SHIFTOPS_IMPORT_ENV file or process.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Mapping file: /tmp/import-mapping.json (auto-created by --list)
 */

import { createClient } from "@supabase/supabase-js";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const execFileP = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────────

const PDF_DIR = "/Users/dineshanchetty/Documents/claimtec/pgsa";
const MAPPING_FILE = "/tmp/import-mapping.json";
const DRYRUN_OUT = "/tmp/import-dryrun.json";

const BRANCH_PREFIXES = ["DEB MP", "DEB SS", "FISH SS", "STEERS SS"];

// Try loading env from multiple sources
async function loadEnv() {
  // 1) Explicit env file
  const envFile = process.env.SHIFTOPS_IMPORT_ENV;
  if (envFile && existsSync(envFile)) {
    const content = await readFile(envFile, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  // 2) shiftops .env.local for SUPABASE_URL
  const localEnv = "/Users/dineshanchetty/pgsa/shiftops/.env.local";
  if (existsSync(localEnv)) {
    const content = await readFile(localEnv, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY)=(.*)$/);
      if (m) {
        const key = m[1].replace(/^NEXT_PUBLIC_/, "");
        if (!process.env[key]) process.env[key] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mode = args.find((a) => ["--list", "--dry-run", "--apply"].includes(a));
const branchFilter = args.includes("--branch") ? args[args.indexOf("--branch") + 1] : null;
const typeFilter = args.includes("--type") ? args[args.indexOf("--type") + 1] : null;
const pdfFilter = args.includes("--pdf") ? args[args.indexOf("--pdf") + 1] : null;
const createMissingStaff = args.includes("--create-missing-staff");

if (!mode) {
  console.error("Usage: import-historic.mjs --list | --dry-run | --apply [--branch X] [--type turnover|payroll] [--pdf file.pdf] [--create-missing-staff]");
  process.exit(1);
}

// ─── PDF inventory ───────────────────────────────────────────────────────────

function classifyPdf(filename) {
  const f = filename.trim();
  if (/^PAYROLL/i.test(f) || /PAYROLL/i.test(f)) {
    for (const p of BRANCH_PREFIXES) {
      if (f.toUpperCase().includes(p)) return { type: "payroll", branchPrefix: p };
    }
    return { type: "payroll", branchPrefix: null };
  }
  // Monthly turnover: starts with branch prefix
  for (const p of BRANCH_PREFIXES) {
    if (f.toUpperCase().startsWith(p + " ") || f.toUpperCase().startsWith(p + "_")) {
      return { type: "turnover", branchPrefix: p };
    }
  }
  return { type: "unknown", branchPrefix: null };
}

function parseMonthFromFilename(filename) {
  // e.g. "DEB MP MARCH 26.pdf" → year=2026 month=3
  const monthNames = { JAN: 1, FEB: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
  const f = filename.toUpperCase().replace(/\.PDF$/, "");
  const m = f.match(/(JAN|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUG|SEPT|SEP|OCT|NOV|DEC)\s+(\d{2})/);
  if (!m) return null;
  const month = monthNames[m[1]];
  const year = 2000 + parseInt(m[2]);
  return { year, month };
}

async function inventoryPdfs() {
  const files = await readdir(PDF_DIR);
  const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));
  return pdfs.map((f) => {
    const { type, branchPrefix } = classifyPdf(f);
    const period = type === "turnover" ? parseMonthFromFilename(f) : null;
    return { file: f, type, branchPrefix, period };
  });
}

// ─── Supabase client ─────────────────────────────────────────────────────────

let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// ─── PDF text extraction (pdftotext -layout) ────────────────────────────────

async function pdfToText(filepath) {
  const { stdout } = await execFileP("pdftotext", ["-layout", filepath, "-"], {
    maxBuffer: 50 * 1024 * 1024, // 50 MB
  });
  return stdout;
}

// Parse a Rand amount: "R13385.39" → 13385.39, "-R192.83" → -192.83, "R0.00" → 0
function parseR(s) {
  if (!s) return null;
  const t = s.replace(/[\s,]/g, "");
  const m = t.match(/^(-?)R?(-?)(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const sign = (m[1] === "-" || m[2] === "-") ? -1 : 1;
  return sign * parseFloat(m[3]);
}

// Parse "HH:MM" → decimal hours. "00:00" → 0
function parseHM(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return +parseFloat(parseInt(m[1]) + parseInt(m[2]) / 60).toFixed(2);
}

const DAY_RE = "(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)";

// ─── Turnover parser (deterministic) ─────────────────────────────────────────

function parseTurnoverText(text) {
  const branchMatch = text.match(/Branch:\s*(.+)/);
  const monthMatch = text.match(/Month:\s*(\d{2})-(\d{4})/);
  const branch = branchMatch?.[1]?.trim() ?? null;
  const period = monthMatch ? `${monthMatch[1]}-${monthMatch[2]}` : null;
  const year = monthMatch ? parseInt(monthMatch[2]) : null;

  const lines = text.split("\n");
  const rows = [];
  // Each daily row starts with a day name and date "DD-MM-YYYY"
  const rowRe = new RegExp(`^\\s*(${DAY_RE})\\s+(\\d{2})-(\\d{2})-(\\d{4})\\s+(.+)$`);
  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;
    const [, day, dd, mm, yyyy, rest] = m;
    // The rest of the line is whitespace-separated R-amounts (possibly with - prefix) and a final %.
    const tokens = rest.trim().split(/\s+/);
    // Expected order: prev_yr_to, budget_nett, budget_gross, actual_nett, difference, rt_difference, rt_prev_yr, rt_budget_nett, rt_actual_to, growth, growth_pct
    if (tokens.length < 4) continue;
    const prev_yr_to = parseR(tokens[0]);
    const budget_nett = parseR(tokens[1]);
    const budget_gross = parseR(tokens[2]);
    const actual_nett = parseR(tokens[3]);
    const growth_pct_str = tokens[tokens.length - 1];
    const growth_pct = growth_pct_str.endsWith("%")
      ? parseFloat(growth_pct_str.replace("%", ""))
      : null;
    if (actual_nett == null) continue;
    rows.push({
      date: `${yyyy}-${mm}-${dd}`,
      day,
      prev_yr_to,
      budget_nett,
      budget_gross,
      actual_nett,
      growth_pct,
    });
  }

  // Footer summary
  const wageMatch = text.match(/Actual Wage Total:\s*(R[\d.,-]+)/);
  const actual_wage_total = wageMatch ? parseR(wageMatch[1]) : null;

  return { branch, period, year, actual_wage_total, rows };
}

// ─── Payroll parser (deterministic) ─────────────────────────────────────────

function parsePayrollText(text) {
  const branchMatch = text.match(/Branch:\s*(.+)/);
  const datesMatch = text.match(/Dates:\s*(\d{2})-(\d{2})-(\d{4})\s*to\s*(\d{2})-(\d{2})-(\d{4})/);
  const branch = branchMatch?.[1]?.trim() ?? null;
  const date_from = datesMatch ? `${datesMatch[3]}-${datesMatch[2]}-${datesMatch[1]}` : null;
  const date_to = datesMatch ? `${datesMatch[6]}-${datesMatch[5]}-${datesMatch[4]}` : null;

  const lines = text.split("\n");

  // Step 1: identify the header block (starts after summary, ends before first data row)
  // The first data row matches: <day> <DD/MM/YYYY> followed by HH:MM tokens.
  const firstDataIdx = lines.findIndex((l) => new RegExp(`^\\s*${DAY_RE}\\s+\\d{2}/\\d{2}/\\d{4}\\b`).test(l));
  if (firstDataIdx < 0) {
    return { branch, date_from, date_to, staff: [], rows: [] };
  }

  // Step 2: collect the FIRST data row to determine column count
  const firstRow = lines[firstDataIdx];
  // Skip "<day> <date>" prefix, count remaining HH:MM values
  const hmRe = /\b(\d{1,3}):(\d{2})\b/g;
  const firstRowMatches = [...firstRow.matchAll(hmRe)];
  // Last HH:MM in the row is "Total Hours", drop it
  const numStaffCols = firstRowMatches.length - 1;

  // Step 3: build staff names by combining header lines (multi-line names)
  // Use column-position alignment: each name token's start column tells us which staff column it belongs to.
  // Header starts ~6-7 lines before first data row. Walk back until we find the "Day Date" header line.
  let dayDateIdx = -1;
  for (let i = firstDataIdx - 1; i >= 0; i--) {
    if (/^\s*Day\s+Date\b/.test(lines[i])) { dayDateIdx = i; break; }
  }
  if (dayDateIdx < 0) {
    // Fallback: use 8 lines back
    dayDateIdx = Math.max(0, firstDataIdx - 8);
  }

  // Determine start column of each staff data column from the first data row.
  // Each HH:MM in firstRow has a known character offset. Use those as anchors.
  const colAnchors = [];
  let searchFrom = 0;
  for (let i = 0; i < numStaffCols; i++) {
    const m = firstRow.slice(searchFrom).match(/\b\d{1,3}:\d{2}\b/);
    if (!m) break;
    const idx = searchFrom + m.index;
    colAnchors.push(idx);
    searchFrom = idx + m[0].length;
  }

  // Find the upper bound of the name-header block: scan back from dayDateIdx for the
  // CATEGORY line (FOH / BOH / Driver / Manager). Names live BETWEEN that and dayDateIdx.
  let categoryIdx = -1;
  for (let i = dayDateIdx - 1; i >= Math.max(0, dayDateIdx - 10); i--) {
    const line = lines[i] ?? "";
    // A category line has only category labels separated by whitespace, no names/numbers.
    // Match: only words from {FOH, BOH, Driver, Drivers, Manager, Managers, Online}
    if (/^\s*((FOH|BOH|Driver|Drivers|Manager|Managers|Online)\s*)+$/i.test(line)) {
      categoryIdx = i;
      break;
    }
  }
  // If no category line found, fall back to a 4-line window (typical header height)
  const headerStart = categoryIdx >= 0 ? categoryIdx + 1 : Math.max(0, dayDateIdx - 4);

  // Build per-column name parts.
  const nameParts = Array.from({ length: numStaffCols }, () => []);
  for (let i = headerStart; i <= dayDateIdx; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const isDayLine = /Day\s+Date/.test(line);
    const tokenRe = /\S+/g;
    let tm;
    while ((tm = tokenRe.exec(line)) !== null) {
      const tok = tm[0];
      const pos = tm.index;
      if (isDayLine && (tok === "Day" || tok === "Date" || tok === "Total" || tok === "Hours")) continue;
      if (/^(FOH|BOH|Driver|Manager|Drivers|Managers|Online)$/i.test(tok)) continue;
      // Find which column anchor this token belongs to (closest by character distance).
      let bestCol = 0, bestDist = Infinity;
      for (let c = 0; c < colAnchors.length; c++) {
        const d = Math.abs(colAnchors[c] - pos);
        if (d < bestDist) { bestDist = d; bestCol = c; }
      }
      if (bestDist > 12) continue;
      nameParts[bestCol].push(tok);
    }
  }

  const staff = nameParts.map((parts, i) => ({
    column_index: i,
    full_name: parts.join(" ").replace(/\s+/g, " ").trim(),
  }));

  // Step 4: parse data rows
  const rows = [];
  const dataRowRe = new RegExp(`^\\s*${DAY_RE}\\s+(\\d{2})/(\\d{2})/(\\d{4})\\s+(.+)$`);
  for (let i = firstDataIdx; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(dataRowRe);
    if (!m) continue;
    const [, dd, mm, yyyy, rest] = m;
    const hms = [...rest.matchAll(/\b(\d{1,3}):(\d{2})\b/g)].map((mm2) => parseHM(mm2[0]));
    if (hms.length < numStaffCols) continue;
    const hours_arr = hms.slice(0, numStaffCols);
    const date = `${yyyy}-${mm}-${dd}`;
    const hours_by_staff = {};
    staff.forEach((s, idx) => {
      hours_by_staff[s.full_name] = hours_arr[idx];
    });
    rows.push({ date, hours: hours_arr, hours_by_staff });
  }

  // Footer wages
  const wageMatch = text.match(/Actual Wage Total:\s*(R[\d.,-]+)/);
  const actual_wage_total = wageMatch ? parseR(wageMatch[1]) : null;
  const budgetWageMatch = text.match(/Budget Wage Total:\s*(R[\d.,-]+)/);
  const budget_wage_total = budgetWageMatch ? parseR(budgetWageMatch[1]) : null;

  return { branch, date_from, date_to, actual_wage_total, budget_wage_total, staff, rows };
}

// ─── AI verifier (sample one row + compare) ─────────────────────────────────

const OPENAI_KEY = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");
  return process.env.OPENAI_API_KEY;
};

async function aiVerifyTurnoverRow(filename, base64, expectedDate, expectedActualNett) {
  const prompt = `From this PDF, find the row for date ${expectedDate}. Return ONLY: {"date":"${expectedDate}","actual_nett":<number>}. The "Actual Nett" column is the 4th amount column.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "file", file: { filename, file_data: `data:application/pdf;base64,${base64}` } },
        { type: "text", text: prompt },
      ] }],
    }),
  });
  if (!resp.ok) return { ok: false, err: `OpenAI ${resp.status}` };
  const data = await resp.json();
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    const aiVal = parsed.actual_nett;
    const matches = Math.abs((aiVal ?? 0) - (expectedActualNett ?? 0)) < 0.5;
    return { ok: matches, aiVal, expected: expectedActualNett };
  } catch { return { ok: false, err: "json parse" }; }
}

async function pdfToBase64(filepath) {
  const buf = await readFile(filepath);
  return buf.toString("base64");
}

// ─── Mapping file ────────────────────────────────────────────────────────────

async function loadMapping() {
  if (!existsSync(MAPPING_FILE)) return null;
  return JSON.parse(await readFile(MAPPING_FILE, "utf8"));
}

async function writeMappingTemplate(branches, pdfs) {
  const branchPrefixes = [...new Set(pdfs.map((p) => p.branchPrefix).filter(Boolean))];
  const template = {
    _comment: "Fill in branch_map: paste the branch UUID from the list above for each prefix. Set to null to skip.",
    branch_map: Object.fromEntries(branchPrefixes.map((p) => [p, null])),
    _comment_staff: "Once you run --dry-run, this file will be re-written with all staff names found in payroll PDFs. Map each to a staff UUID, or null to skip.",
    staff_map: {},
    vat_factor: 1.15,
    create_missing_staff: false,
  };
  await writeFile(MAPPING_FILE, JSON.stringify(template, null, 2));
  console.log(`\n✏️  Mapping template written to ${MAPPING_FILE}`);
  console.log(`   Edit it (paste branch UUIDs from the list above) then re-run with --dry-run.`);
}

// ─── List mode ───────────────────────────────────────────────────────────────

async function listMode() {
  console.log("\n═══ Historic Import — Listing ═══\n");

  const sb = getSupabase();
  const { data: branches, error } = await sb
    .from("branches")
    .select("id, name, tenant_id, email_code")
    .order("name");
  if (error) throw new Error(`Branches query: ${error.message}`);

  console.log("📍 Branches in DB:");
  for (const b of branches ?? []) {
    console.log(`   ${b.id}  ${b.name}  (email: aura+${b.email_code}@aura.shiftops.co.za)`);
  }

  const pdfs = await inventoryPdfs();
  const byPrefix = pdfs.reduce((m, p) => {
    const k = `${p.branchPrefix ?? "(unknown)"} / ${p.type}`;
    (m[k] ??= []).push(p.file);
    return m;
  }, {});
  console.log(`\n📄 PDFs in ${PDF_DIR} (${pdfs.length} total):`);
  for (const [k, files] of Object.entries(byPrefix).sort()) {
    console.log(`   ${k}  (${files.length})`);
    files.sort().forEach((f) => console.log(`      ${f}`));
  }

  console.log("\n═══════════════════════════════════\n");
  await writeMappingTemplate(branches ?? [], pdfs);
}

// ─── Parse one PDF ───────────────────────────────────────────────────────────

async function parseTurnoverPdf(file, opts = {}) {
  const filepath = path.join(PDF_DIR, file);
  console.log(`   📊 Parsing ${file}...`);
  const text = await pdfToText(filepath);
  const data = parseTurnoverText(text);
  console.log(`      ✓ ${data.rows?.length ?? 0} daily rows extracted (period ${data.period})`);

  // AI verify a sample row (last row of the month) — quick sanity check
  if (opts.verify && data.rows.length > 0) {
    const sample = data.rows[Math.floor(data.rows.length / 2)];
    const b64 = await pdfToBase64(filepath);
    const v = await aiVerifyTurnoverRow(file, b64, sample.date, sample.actual_nett);
    if (v.ok) console.log(`      🔎 AI verify ${sample.date}: ✓ R${sample.actual_nett}`);
    else console.warn(`      🔎 AI verify ${sample.date}: ✗ extracted R${sample.actual_nett} but AI got R${v.aiVal} (${v.err ?? "mismatch"})`);
  }
  return data;
}

async function parsePayrollPdf(file) {
  const filepath = path.join(PDF_DIR, file);
  console.log(`   👥 Parsing ${file}...`);
  const text = await pdfToText(filepath);
  const data = parsePayrollText(text);
  console.log(`      ✓ ${data.staff?.length ?? 0} staff × ${data.rows?.length ?? 0} days extracted (${data.date_from} → ${data.date_to})`);
  if (data.staff.length > 0) {
    console.log(`      Staff: ${data.staff.map((s) => s.full_name).join(", ")}`);
  }
  return data;
}

// ─── Build write plans ───────────────────────────────────────────────────────

async function buildPlan(pdfs, mapping) {
  const sb = getSupabase();
  const plan = {
    daily_cashups: { create: [], update: [], skip: [] },
    roster_entries: { create: [], update: [], skip: [] },
    staff_unmapped: new Set(),
    branches: {},
  };

  // Filter
  let toProcess = pdfs.filter((p) => p.type !== "unknown");
  if (branchFilter) toProcess = toProcess.filter((p) => p.branchPrefix === branchFilter);
  if (typeFilter) toProcess = toProcess.filter((p) => p.type === typeFilter);
  if (pdfFilter) toProcess = toProcess.filter((p) => p.file === pdfFilter);

  // Group by prefix
  const byPrefix = toProcess.reduce((m, p) => {
    if (!p.branchPrefix) return m;
    (m[p.branchPrefix] ??= []).push(p);
    return m;
  }, {});

  for (const [prefix, files] of Object.entries(byPrefix)) {
    const branchId = mapping.branch_map?.[prefix];
    if (!branchId) {
      console.log(`\n⚠️  ${prefix}: no branch mapping — SKIPPING ${files.length} PDFs`);
      continue;
    }

    // Get tenant_id and existing data for this branch
    const { data: branchRow } = await sb.from("branches").select("tenant_id, name").eq("id", branchId).single();
    if (!branchRow) {
      console.log(`\n⚠️  ${prefix}: branch ${branchId} not found — SKIPPING`);
      continue;
    }
    const tenantId = branchRow.tenant_id;

    plan.branches[prefix] = { branchId, branchName: branchRow.name, tenantId };
    console.log(`\n──── ${prefix} → ${branchRow.name} ────`);

    // Pre-fetch existing daily_cashups for this branch (all dates touched by PDFs)
    const { data: existingCashups } = await sb
      .from("daily_cashups")
      .select("id, date, gross_turnover, status, data_source, submitted_at")
      .eq("branch_id", branchId);
    const cashupByDate = new Map((existingCashups ?? []).map((r) => [r.date, r]));

    // Pre-fetch existing roster_entries for this branch
    const { data: existingRoster } = await sb
      .from("roster_entries")
      .select("id, date, staff_id, shift_hours, shift_start, is_off")
      .eq("branch_id", branchId);
    const rosterByKey = new Map((existingRoster ?? []).map((r) => [`${r.staff_id}::${r.date}`, r]));

    // Process turnover PDFs (verify the FIRST PDF for each branch with AI sanity check)
    const turnoverPdfs = files.filter((p) => p.type === "turnover");
    for (let pi = 0; pi < turnoverPdfs.length; pi++) {
      const pdf = turnoverPdfs[pi];
      let data;
      try { data = await parseTurnoverPdf(pdf.file, { verify: pi === 0 }); }
      catch (e) { console.error(`      ✗ FAILED: ${e.message}`); continue; }

      const vatFactor = mapping.vat_factor ?? 1.15;
      for (const row of (data.rows ?? [])) {
        if (!row.date || row.actual_nett == null) continue;
        const grossTo = +(row.actual_nett * vatFactor).toFixed(2);
        const fields = {
          gross_turnover: grossTo,
          budget_nett: row.budget_nett ?? null,
          budget_gross: row.budget_gross ?? null,
          prev_yr_to: row.prev_yr_to ?? null,
          growth_pct: row.growth_pct ?? null,
        };
        const existing = cashupByDate.get(row.date);
        if (existing) {
          // Real submitted cashups have submitted_at — never overwrite their gross_turnover etc.
          // But we DO want to enrich them with prev_yr_to + budget reference data.
          if (existing.submitted_at) {
            plan.daily_cashups.update.push({
              id: existing.id, branchId, tenantId, date: row.date, source: pdf.file,
              // Only enrich the historic-only fields; leave gross_turnover alone.
              budget_nett: row.budget_nett ?? null,
              budget_gross: row.budget_gross ?? null,
              prev_yr_to: row.prev_yr_to ?? null,
              growth_pct: row.growth_pct ?? null,
              keep_actuals: true,
            });
          } else {
            // Historic-imported (or empty draft) — refresh all fields.
            plan.daily_cashups.update.push({ id: existing.id, branchId, tenantId, date: row.date, source: pdf.file, ...fields });
          }
        } else {
          plan.daily_cashups.create.push({ branchId, tenantId, date: row.date, status: "submitted", data_source: "historic_import", source: pdf.file, ...fields });
        }
      }
    }

    // Process payroll PDFs (1 per branch)
    for (const pdf of files.filter((p) => p.type === "payroll")) {
      let data;
      try { data = await parsePayrollPdf(pdf.file); }
      catch (e) { console.error(`      ✗ FAILED: ${e.message}`); continue; }

      // Look up existing staff by name (case-insensitive) for this tenant
      const { data: tenantStaff } = await sb
        .from("staff")
        .select("id, first_name, last_name")
        .eq("tenant_id", tenantId);
      const normalizeName = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const staffByName = new Map();
      for (const s of tenantStaff ?? []) {
        const full = normalizeName(`${s.first_name} ${s.last_name}`);
        staffByName.set(full, s.id);
      }

      // Auto-create missing staff (inactive, no rate) if --create-missing-staff
      const autoCreate = createMissingStaff || mapping.create_missing_staff;
      if (autoCreate) {
        // Identify all unique staff names from the payroll rows that aren't in DB
        const allNames = new Set();
        for (const row of data.rows ?? []) {
          for (const name of Object.keys(row.hours_by_staff ?? {})) allNames.add(name);
        }
        for (const name of allNames) {
          const norm = normalizeName(name);
          if (staffByName.has(norm)) continue;
          if (mapping.staff_map?.[name]) continue;
          // Split name into first + last (last token = surname, rest = first name)
          const parts = name.trim().split(/\s+/);
          const last_name = parts.length > 1 ? parts[parts.length - 1] : "";
          const first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
          const { data: inserted, error } = await sb.from("staff").insert({
            tenant_id: tenantId,
            branch_id: branchId,
            first_name,
            last_name,
            employment_type: "permanent",
            active: false,
          }).select("id").single();
          if (error) {
            console.error(`   ✗ auto-create staff "${name}": ${error.message}`);
          } else {
            staffByName.set(norm, inserted.id);
            console.log(`   + auto-created staff "${name}" (inactive)`);
          }
        }
      }

      for (const row of (data.rows ?? [])) {
        if (!row.date || !row.hours_by_staff) continue;
        for (const [staffName, hours] of Object.entries(row.hours_by_staff)) {
          if (typeof hours !== "number" || hours < 0) continue;
          // Resolve staff ID
          let staffId = mapping.staff_map?.[staffName];
          if (!staffId) staffId = staffByName.get(normalizeName(staffName));
          if (!staffId) {
            plan.staff_unmapped.add(staffName);
            continue;
          }

          const isOff = hours === 0;
          const existing = rosterByKey.get(`${staffId}::${row.date}`);
          if (existing) {
            if (existing.shift_start) {
              plan.roster_entries.skip.push({ date: row.date, staffId, branchId, reason: "shift_start already set (real shift)" });
            } else if (existing.shift_hours != null && existing.shift_hours > 0 && !isOff) {
              plan.roster_entries.skip.push({ date: row.date, staffId, branchId, reason: `shift_hours already ${existing.shift_hours}` });
            } else {
              plan.roster_entries.update.push({ id: existing.id, staffId, branchId, tenantId, date: row.date, shift_hours: isOff ? null : hours, is_off: isOff });
            }
          } else {
            plan.roster_entries.create.push({ staffId, branchId, tenantId, date: row.date, shift_hours: isOff ? null : hours, is_off: isOff });
          }
        }
      }
    }

    console.log(`   daily_cashups: create=${plan.daily_cashups.create.filter((r) => r.branchId === branchId).length} update=${plan.daily_cashups.update.filter((r) => r.branchId === branchId).length} skip=${plan.daily_cashups.skip.filter((r) => r.branchId === branchId).length}`);
    console.log(`   roster_entries: create=${plan.roster_entries.create.filter((r) => r.branchId === branchId).length} update=${plan.roster_entries.update.filter((r) => r.branchId === branchId).length} skip=${plan.roster_entries.skip.filter((r) => r.branchId === branchId).length}`);
  }

  return plan;
}

// ─── Mode handlers ───────────────────────────────────────────────────────────

async function dryRunMode() {
  console.log("\n═══ Historic Import — DRY RUN (no DB writes) ═══\n");
  const mapping = await loadMapping();
  if (!mapping) {
    console.error(`✗ Mapping file not found at ${MAPPING_FILE}. Run --list first.`);
    process.exit(1);
  }
  const pdfs = await inventoryPdfs();
  const plan = await buildPlan(pdfs, mapping);

  console.log("\n═══ SUMMARY ═══");
  console.log(`daily_cashups:   ${plan.daily_cashups.create.length} create, ${plan.daily_cashups.update.length} update, ${plan.daily_cashups.skip.length} skip`);
  console.log(`roster_entries:  ${plan.roster_entries.create.length} create, ${plan.roster_entries.update.length} update, ${plan.roster_entries.skip.length} skip`);
  console.log(`unmapped staff:  ${plan.staff_unmapped.size} unique names`);

  if (plan.staff_unmapped.size > 0) {
    console.log("\nUnmapped staff names (add to staff_map in mapping file):");
    for (const name of [...plan.staff_unmapped].sort()) console.log(`   "${name}": null,`);
  }

  await writeFile(DRYRUN_OUT, JSON.stringify({
    summary: {
      cashups_create: plan.daily_cashups.create.length,
      cashups_update: plan.daily_cashups.update.length,
      cashups_skip: plan.daily_cashups.skip.length,
      roster_create: plan.roster_entries.create.length,
      roster_update: plan.roster_entries.update.length,
      roster_skip: plan.roster_entries.skip.length,
      unmapped_staff: [...plan.staff_unmapped],
    },
    branches: plan.branches,
    daily_cashups: plan.daily_cashups,
    roster_entries: plan.roster_entries,
  }, null, 2));
  console.log(`\n📄 Full preview written to ${DRYRUN_OUT}`);
  console.log(`Review it, then run with --apply to write to the DB.`);
}

async function applyMode() {
  console.log("\n═══ Historic Import — APPLYING WRITES ═══\n");
  const mapping = await loadMapping();
  if (!mapping) {
    console.error(`✗ Mapping file not found at ${MAPPING_FILE}.`);
    process.exit(1);
  }
  const pdfs = await inventoryPdfs();
  const plan = await buildPlan(pdfs, mapping);

  const sb = getSupabase();
  const BATCH = 500;

  // daily_cashups creates
  console.log(`\n📥 daily_cashups: ${plan.daily_cashups.create.length} creates...`);
  for (let i = 0; i < plan.daily_cashups.create.length; i += BATCH) {
    const slice = plan.daily_cashups.create.slice(i, i + BATCH).map((r) => ({
      branch_id: r.branchId,
      tenant_id: r.tenantId,
      date: r.date,
      gross_turnover: r.gross_turnover,
      budget_nett: r.budget_nett,
      budget_gross: r.budget_gross,
      prev_yr_to: r.prev_yr_to,
      growth_pct: r.growth_pct,
      // Backfill cash_banked = gross_turnover for historic so banking variance reads as 0.
      cash_banked: r.gross_turnover,
      data_source: "historic_import",
      status: "submitted",
    }));
    const { error } = await sb.from("daily_cashups").insert(slice);
    if (error) console.error(`  ✗ batch ${i}: ${error.message}`);
    else console.log(`  ✓ ${i + slice.length}/${plan.daily_cashups.create.length}`);
  }

  // daily_cashups updates — refresh historic fields. If keep_actuals=true, do not touch gross_turnover or data_source.
  console.log(`\n✏️  daily_cashups: ${plan.daily_cashups.update.length} updates...`);
  for (const r of plan.daily_cashups.update) {
    const patch = {
      budget_nett: r.budget_nett,
      budget_gross: r.budget_gross,
      prev_yr_to: r.prev_yr_to,
      growth_pct: r.growth_pct,
    };
    if (!r.keep_actuals) {
      patch.gross_turnover = r.gross_turnover;
      patch.data_source = "historic_import";
    }
    const { error } = await sb.from("daily_cashups").update(patch).eq("id", r.id);
    if (error) console.error(`  ✗ ${r.date}: ${error.message}`);
  }

  // roster_entries creates
  console.log(`\n📥 roster_entries: ${plan.roster_entries.create.length} creates...`);
  for (let i = 0; i < plan.roster_entries.create.length; i += BATCH) {
    const slice = plan.roster_entries.create.slice(i, i + BATCH).map((r) => ({
      branch_id: r.branchId,
      tenant_id: r.tenantId,
      staff_id: r.staffId,
      date: r.date,
      shift_hours: r.shift_hours,
      is_off: r.is_off,
    }));
    const { error } = await sb.from("roster_entries").insert(slice);
    if (error) console.error(`  ✗ batch ${i}: ${error.message}`);
    else console.log(`  ✓ ${i + slice.length}/${plan.roster_entries.create.length}`);
  }

  // roster_entries updates
  console.log(`\n✏️  roster_entries: ${plan.roster_entries.update.length} updates...`);
  for (const r of plan.roster_entries.update) {
    const { error } = await sb.from("roster_entries").update({ shift_hours: r.shift_hours, is_off: r.is_off }).eq("id", r.id);
    if (error) console.error(`  ✗ ${r.date}/${r.staffId}: ${error.message}`);
  }

  console.log("\n✅ Done.");
}

// ─── Entry ───────────────────────────────────────────────────────────────────

(async () => {
  await loadEnv();
  if (mode === "--list") await listMode();
  else if (mode === "--dry-run") await dryRunMode();
  else if (mode === "--apply") {
    if (!createMissingStaff) {
      console.log("ℹ️  Pass --create-missing-staff to auto-create unknown staff (default is to skip).");
    }
    await applyMode();
  }
})().catch((err) => {
  console.error("\n❌ Fatal:", err.message ?? err);
  process.exit(1);
});
