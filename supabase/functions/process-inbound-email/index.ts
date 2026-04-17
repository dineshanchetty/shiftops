import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Process Inbound Email — Edge Function
 *
 * Handles Aura daily report pack via SendGrid Inbound Parse.
 *
 * Flow:
 *   1. Extract +tag from recipient → lookup branch by email_code
 *   2. Find Shop Cashup Summary PDF → extract via OpenAI → upsert daily_cashups (source of truth)
 *   3. For each supporting PDF, extract its key figure and cross-validate against cashup
 *   4. Store all PDFs in cashup_documents with verification_status
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
// SendGrid Event Webhook public key (ECDSA P-256, base64 DER). Set once signed webhooks are enabled.
const SENDGRID_WEBHOOK_PUBLIC_KEY = Deno.env.get("SENDGRID_WEBHOOK_PUBLIC_KEY");

// Rate limit: max emails per sender per hour window.
const RATE_LIMIT_MAX_PER_HOUR = 10;

// Tolerance for variance checks (R5 for cash, larger for sales totals)
const CASH_TOLERANCE = 5.0;
const SALES_TOLERANCE = 10.0;

// ─── Report type classification ──────────────────────────────────────────────

type ReportType =
  | "cashup_summary"
  | "cashup_detail"
  | "discounts"
  | "overring"
  | "sales_by_hour"
  | "item_sales"
  | "stock_variance"
  | "stock_transfers"
  | "kitchen_speed"
  | "cc_batch"
  | "banking_slip"
  | "scan"
  | "other";

interface ReportTypeInfo {
  type: ReportType;
  /** Which cashup field (if any) this report validates */
  validatesField: "gross_turnover" | "discounts" | "credit_cards" | "cash_banked" | "debtors" | null;
  /** doc_type for cashup_documents table */
  docType: "cc_batch" | "banking_slip" | "cashup_summary" | "stock_report" | "other";
}

function classifyReport(filename: string): ReportTypeInfo {
  const f = filename.toLowerCase();
  if (f.includes("cashup summary") || f.includes("cashup_summary"))
    return { type: "cashup_summary", validatesField: null, docType: "cashup_summary" };
  if (f.includes("cashup detail"))
    return { type: "cashup_detail", validatesField: null, docType: "cashup_summary" };
  if (f.includes("discount"))
    return { type: "discounts", validatesField: "discounts", docType: "other" };
  if (f.includes("overring") || f.includes("over ring") || f.includes("over_ring"))
    return { type: "overring", validatesField: null, docType: "other" }; // no cashup field for this
  if (f.includes("sales by hour"))
    return { type: "sales_by_hour", validatesField: "gross_turnover", docType: "other" };
  if (f.includes("item sales"))
    return { type: "item_sales", validatesField: "gross_turnover", docType: "other" };
  if (f.includes("stock variance"))
    return { type: "stock_variance", validatesField: null, docType: "stock_report" };
  if (f.includes("stock transfer"))
    return { type: "stock_transfers", validatesField: null, docType: "stock_report" };
  if (f.includes("kitchen speed") || f.includes("kitchen_speed"))
    return { type: "kitchen_speed", validatesField: null, docType: "other" };
  if (f.includes("cc batch") || f.includes("credit card") || f.includes("card batch"))
    return { type: "cc_batch", validatesField: "credit_cards", docType: "cc_batch" };
  if (f.includes("banking") || f.includes("deposit") || f.includes("slip"))
    return { type: "banking_slip", validatesField: "cash_banked", docType: "banking_slip" };
  if (f.includes("scan"))
    return { type: "scan", validatesField: null, docType: "other" }; // manual scans
  return { type: "other", validatesField: null, docType: "other" };
}

// ─── AI extraction prompts ───────────────────────────────────────────────────

const CASHUP_SUMMARY_PROMPT = `You are analyzing a "Shop Cashup Summary" PDF from the Aura POS system for a Debonairs Pizza franchise.

Extract these fields and return ONLY valid JSON:
{
  "date": "YYYY-MM-DD (from report header, e.g. 'Monday the 13 April, 2026')",
  "gross_turnover": <"Gross Sales (Ex. O/R)" amount>,
  "discounts": <"LESS Discounts" amount>,
  "delivery_charges": <"ADD Delivery Charges" amount>,
  "credit_cards": <"Credit Cards" amount>,
  "cash_banked": <"Cash to be banked" amount, or "Cash" if first missing>,
  "debtors": <"Debtors" amount>
}
All amounts in ZAR. Use 0 if a field shows 0.00. Use null if not present.`;

const SUPPORTING_REPORT_PROMPTS: Partial<Record<ReportType, string>> = {
  discounts: `You are analyzing a "Discounts Summary" PDF from Aura POS. Extract the TOTAL discount amount for the day. Return JSON: { "total": <number>, "breakdown": {...} }`,
  overring: `You are analyzing an "Overring Summary" PDF from Aura POS. Extract the TOTAL overring amount for the day. Return JSON: { "total": <number>, "count": <number> }`,
  sales_by_hour: `You are analyzing a "Sales by Hour by Report Group" PDF from Aura POS. Extract the GRAND TOTAL sales across all hours. Return JSON: { "total": <number> }`,
  item_sales: `You are analyzing an "Item Sales by Report Group" PDF from Aura POS. Extract the GRAND TOTAL sales value. Return JSON: { "total": <number> }`,
  stock_variance: `You are analyzing a "Stock Variance" PDF from Aura POS. Extract the total variance amount (positive or negative). Return JSON: { "total": <number> }`,
  cc_batch: `You are analyzing a credit card batch settlement report. Extract the TOTAL credit card amount processed. Return JSON: { "total": <number> }`,
  banking_slip: `You are analyzing a bank deposit slip. Extract the TOTAL deposit amount. Return JSON: { "total": <number> }`,
  scan: `__SCAN_PROMPT_TEMPLATE__`, // Replaced per-call with date-aware version
};

function buildScanPrompt(reportDate: string, cashupFields: Record<string, number | null>): string {
  const hints: string[] = [];
  if (cashupFields.credit_cards != null) hints.push(`- Credit Cards (expected if CC batch): R${cashupFields.credit_cards.toFixed(2)}`);
  if (cashupFields.cash_banked != null) hints.push(`- Cash Banked (expected if banking slip): R${cashupFields.cash_banked.toFixed(2)}`);
  if (cashupFields.gross_turnover != null) hints.push(`- Gross Turnover (if cashup summary): R${cashupFields.gross_turnover.toFixed(2)}`);
  const hintsBlock = hints.length > 0
    ? `\n\nSANITY CHECK HINTS: The cashup summary for ${reportDate} shows:\n${hints.join("\n")}\nUse these as sanity checks. If your handwritten reading is 5-10x larger or smaller than the expected figure, you may have misread a digit (common: reading "5" as "25" if a mark is nearby). Re-examine the digits carefully.`
    : "";

  return `You are analyzing a SCANNED document from a South African restaurant cashup for date ${reportDate}. These documents are printed receipts/slips/logs with HANDWRITTEN totals written by the manager in pen/marker.

CRITICAL RULES:
1. The total for the day is usually HANDWRITTEN (circled, underlined, or written at top/bottom). PRIORITIZE handwritten amounts.
2. If the document is a BANKING LOG with MULTIPLE DATES, find the row for ${reportDate} and use its BANKING TOTAL (usually the rightmost or bottom value for that date).
3. For CC batch reports, use the handwritten "TOTAL BATCH" at the top.
4. Be extra careful reading handwritten digits. Look at the digit count and first digit carefully — a "5" can be mistaken for "25" if there's a stray mark.

CLASSIFY the document:
- Multiple credit card transaction slips or ABSA/FNB/Nedbank/Standard merchant batch report + card brands (Visa/Mastercard) + "Batch Total" / "Settlement" → "cc_batch"
- Banking log/register with columns like DATE, BAG NO, AMOUNT, CASHIER, MANAGER, SIGN, or bank deposit slip / teller stamp → "banking_slip"
- Aura logo + "Shop Cashup" / "Gross Sales" / "Cash tendered" → "cashup_summary"
- Cannot determine → "other"

Extract the TOTAL for ${reportDate} only. Amounts in ZAR without currency symbols.${hintsBlock}

Return JSON: {
  "classification": "cc_batch" | "banking_slip" | "cashup_summary" | "other",
  "total": <number for date ${reportDate}>,
  "handwritten_total_detected": <true or false>,
  "matches_expected_range": <true if your total is within 10% of the relevant hint, false if far off>,
  "description": "<1 short sentence describing what you see, and note if you had to reconsider due to hints>"
}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fileToBase64(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function callOpenAIPDF(base64Pdf: string, filename: string, prompt: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "file", file: { filename, file_data: `data:application/pdf;base64,${base64Pdf}` } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("OpenAI PDF failed:", resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return JSON.parse(content);
  } catch (err) {
    console.error("AI parse error:", err);
    return null;
  }
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

function computeVariance(reportValue: number | null, cashupValue: number | null, tolerance: number): {
  status: "pending" | "verified" | "mismatch";
  variance: number | null;
} {
  if (reportValue === null || cashupValue === null) return { status: "pending", variance: null };
  const diff = reportValue - cashupValue;
  const absDiff = Math.abs(diff);
  return {
    status: absDiff <= tolerance ? "verified" : "mismatch",
    variance: absDiff <= tolerance ? 0 : diff,
  };
}

// ─── Security helpers ────────────────────────────────────────────────────────

/**
 * Verify SendGrid Event Webhook signature (ECDSA P-256 over SHA-256).
 * Reference: https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 *
 * The signed payload is: `timestamp + raw_body`.
 * Returns true if signature is valid OR if no public key is configured (dev mode).
 */
async function verifySendGridSignature(
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!SENDGRID_WEBHOOK_PUBLIC_KEY) {
    console.warn("SENDGRID_WEBHOOK_PUBLIC_KEY not set — skipping signature verification");
    return true;
  }
  if (!signature || !timestamp) return false;

  // Reject stale requests (replay attack defense): >10 min old
  const tsMs = parseInt(timestamp) * 1000;
  if (!isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) {
    console.warn("Stale or invalid webhook timestamp");
    return false;
  }

  try {
    // SendGrid key is a PEM or base64 DER. We accept both by stripping PEM framing.
    const keyB64 = SENDGRID_WEBHOOK_PUBLIC_KEY
      .replace(/-----BEGIN PUBLIC KEY-----/g, "")
      .replace(/-----END PUBLIC KEY-----/g, "")
      .replace(/\s+/g, "");
    const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
    const publicKey = await crypto.subtle.importKey(
      "spki",
      keyBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const msgBytes = new TextEncoder().encode(timestamp + rawBody);

    // SendGrid signatures are DER-encoded; WebCrypto wants raw r||s (IEEE P1363).
    const rawSig = derToRawSig(sigBytes);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      rawSig,
      msgBytes,
    );
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

/** Convert ASN.1 DER-encoded ECDSA signature to IEEE P1363 raw (r||s) 64-byte format. */
function derToRawSig(der: Uint8Array): Uint8Array {
  // Minimal DER parser for SEQUENCE { INTEGER r, INTEGER s }
  let offset = 2; // skip SEQUENCE tag + len
  if (der[0] !== 0x30) throw new Error("bad DER: no SEQUENCE");
  // skip length byte(s)
  if (der[1] & 0x80) offset += der[1] & 0x7f;

  if (der[offset] !== 0x02) throw new Error("bad DER: no INTEGER r");
  const rLen = der[offset + 1];
  let r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;

  if (der[offset] !== 0x02) throw new Error("bad DER: no INTEGER s");
  const sLen = der[offset + 1];
  let s = der.slice(offset + 2, offset + 2 + sLen);

  // Strip leading zeros, then left-pad to 32 bytes
  const stripAndPad = (v: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0x00) i++;
    const trimmed = v.slice(i);
    if (trimmed.length > 32) throw new Error("r or s too long");
    const padded = new Uint8Array(32);
    padded.set(trimmed, 32 - trimmed.length);
    return padded;
  };
  r = stripAndPad(r);
  s = stripAndPad(s);

  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

/**
 * Rate limit check — returns true if the sender has exceeded the hourly cap.
 * Uses email_ingest_log for the rolling window.
 */
async function isRateLimited(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  senderEmail: string,
): Promise<boolean> {
  if (!senderEmail) return false;
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("email_ingest_log")
    .select("*", { count: "exact", head: true })
    .eq("sender_email", senderEmail)
    .gte("created_at", sinceIso);
  if (error) {
    console.warn("Rate-limit query failed, allowing:", error.message);
    return false;
  }
  return (count ?? 0) >= RATE_LIMIT_MAX_PER_HOUR;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // No CORS wildcard — this endpoint is only called by SendGrid (server→server).
  // We keep no Access-Control headers. OPTIONS returns empty.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  const corsHeaders: Record<string, string> = {};
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    // ─── 1. Verify SendGrid signature ──────────────────────────────────────
    // Read raw body first (formData consumes the stream, so we buffer).
    const rawBody = await req.text();
    const signature = req.headers.get("x-twilio-email-event-webhook-signature");
    const timestamp = req.headers.get("x-twilio-email-event-webhook-timestamp");
    const sigOk = await verifySendGridSignature(signature, timestamp, rawBody);
    if (!sigOk) {
      console.warn("Rejecting inbound email: invalid SendGrid signature");
      await supabase.from("email_ingest_log").insert({
        sender_email: "(unverified)",
        status: "bad_signature",
        error_message: "SendGrid signature verification failed",
        source_ip: sourceIp,
      });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    // Re-parse the body as FormData (multipart/form-data from SendGrid)
    const boundary = req.headers.get("content-type")?.match(/boundary=([^;]+)/)?.[1];
    if (!boundary) {
      return new Response(JSON.stringify({ error: "Missing multipart boundary" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    // Rebuild a Request so we can call .formData() on our buffered body
    const bodyReq = new Request(req.url, {
      method: "POST",
      headers: { "content-type": req.headers.get("content-type")! },
      body: rawBody,
    });
    const formData = await bodyReq.formData();

    const from = formData.get("from")?.toString() ?? "";
    const subject = formData.get("subject")?.toString() ?? "";
    const toAddress = formData.get("to")?.toString() ?? "";
    const numAttachments = parseInt(formData.get("attachments")?.toString() ?? "0");

    console.log(`Inbound: from=${from}, to=${toAddress}, attachments=${numAttachments}`);

    // Extract just the address portion from From: header (strip display name)
    const senderEmail = from.match(/<([^>]+)>/)?.[1]?.toLowerCase() ?? from.toLowerCase().trim();

    // ─── 2. Rate limit ─────────────────────────────────────────────────────
    if (await isRateLimited(supabase, senderEmail)) {
      console.warn(`Rate limited: ${senderEmail} exceeded ${RATE_LIMIT_MAX_PER_HOUR}/hour`);
      await supabase.from("email_ingest_log").insert({
        sender_email: senderEmail,
        recipient_email: toAddress,
        status: "rate_limited",
        source_ip: sourceIp,
      });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }

    // ─── 3. Branch lookup ──────────────────────────────────────────────────
    const codeMatch = toAddress.match(/\+([a-z0-9]+)@/i);
    const emailCode = codeMatch?.[1]?.toLowerCase();
    if (!emailCode) {
      await supabase.from("email_ingest_log").insert({
        sender_email: senderEmail,
        recipient_email: toAddress,
        status: "no_branch",
        error_message: "Missing +code tag in recipient",
        source_ip: sourceIp,
      });
      return new Response(JSON.stringify({ success: false, error: "Missing branch code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("id, name, tenant_id")
      .eq("email_code", emailCode)
      .maybeSingle();

    if (!branch) {
      await supabase.from("email_ingest_log").insert({
        sender_email: senderEmail,
        recipient_email: toAddress,
        status: "no_branch",
        error_message: `Unknown code: ${emailCode}`,
        source_ip: sourceIp,
      });
      return new Response(JSON.stringify({ success: false, error: `No branch for code ${emailCode}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Branch: ${branch.name} (${branch.id})`);

    // Log accepted (before heavy work) for rate-limit window tracking
    await supabase.from("email_ingest_log").insert({
      sender_email: senderEmail,
      recipient_email: toAddress,
      branch_id: branch.id,
      tenant_id: branch.tenant_id,
      status: "accepted",
      attachments_count: numAttachments,
      source_ip: sourceIp,
    });

    if (numAttachments === 0) {
      return new Response(JSON.stringify({ success: true, message: "No attachments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse attachment-info
    const attachmentInfoStr = formData.get("attachment-info")?.toString();
    let attachmentInfo: Record<string, { filename: string; type: string }> = {};
    if (attachmentInfoStr) {
      try { attachmentInfo = JSON.parse(attachmentInfoStr); } catch { /* ignore */ }
    }

    // Collect PDFs
    const pdfs: { filename: string; base64: string; size: number; info: ReportTypeInfo }[] = [];
    for (let i = 1; i <= numAttachments; i++) {
      const att = formData.get(`attachment${i}`);
      if (!att || typeof att === "string") continue;
      const info = attachmentInfo[`attachment${i}`];
      const filename = info?.filename ?? `attachment${i}.pdf`;
      const ctype = info?.type ?? "";
      if (filename.toLowerCase().endsWith(".pdf") || ctype.includes("pdf")) {
        const b64 = await fileToBase64(att);
        pdfs.push({
          filename,
          base64: b64,
          size: (att as Blob).size,
          info: classifyReport(filename),
        });
      }
    }

    console.log(`PDFs: ${pdfs.map(p => `${p.filename} → ${p.info.type}`).join(", ")}`);

    if (pdfs.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No PDFs found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Parse Shop Cashup Summary (source of truth) ──
    const summaryPdf = pdfs.find((p) => p.info.type === "cashup_summary");
    let cashupDate: string | null = null;
    let cashupId: string | null = null;
    let cashupFields: Record<string, number | null> = {};

    if (!summaryPdf) {
      console.warn("No Shop Cashup Summary PDF — cannot proceed");
      return new Response(JSON.stringify({
        success: false,
        error: "Daily pack missing Shop Cashup Summary PDF",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Parsing cashup summary: ${summaryPdf.filename}`);
    const aiFields = await callOpenAIPDF(summaryPdf.base64, summaryPdf.filename, CASHUP_SUMMARY_PROMPT);

    if (!aiFields || !aiFields.date) {
      console.error("AI failed to extract cashup summary");
      return new Response(JSON.stringify({ success: false, error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    cashupDate = String(aiFields.date);
    cashupFields = {
      gross_turnover: toNum(aiFields.gross_turnover),
      discounts: toNum(aiFields.discounts),
      delivery_charges: toNum(aiFields.delivery_charges),
      credit_cards: toNum(aiFields.credit_cards),
      cash_banked: toNum(aiFields.cash_banked),
      debtors: toNum(aiFields.debtors),
    };

    // Create aura_imports record (with error logging)
    const { data: importRec, error: importInsertErr } = await supabase
      .from("aura_imports")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        source_file: summaryPdf.filename,
        import_date: cashupDate,
        status: "processing",
        raw_data: { ...aiFields, email_sender: from, email_subject: subject, pdf_count: pdfs.length },
      })
      .select("id")
      .maybeSingle();
    if (importInsertErr) console.error("aura_imports insert failed:", JSON.stringify(importInsertErr));

    // Upsert daily_cashup
    const { data: existing } = await supabase
      .from("daily_cashups")
      .select("id")
      .eq("branch_id", branch.id)
      .eq("date", cashupDate)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("daily_cashups")
        .update({ ...cashupFields, aura_import_id: importRec?.id })
        .eq("id", existing.id);
      if (error) console.error("Update cashup failed:", error.message);
      cashupId = existing.id;
    } else {
      const { data: newC, error } = await supabase
        .from("daily_cashups")
        .insert({
          tenant_id: branch.tenant_id,
          branch_id: branch.id,
          date: cashupDate,
          status: "imported",
          aura_import_id: importRec?.id,
          ...cashupFields,
        })
        .select("id")
        .single();
      if (error) console.error("Insert cashup failed:", error.message);
      cashupId = newC?.id ?? null;
    }

    if (importRec) {
      await supabase.from("aura_imports")
        .update({ status: "completed", parsed_at: new Date().toISOString() })
        .eq("id", importRec.id);
    }

    console.log(`Cashup saved: ${cashupId} for ${cashupDate}`);

    if (!cashupId) {
      return new Response(JSON.stringify({ success: false, error: "Failed to save cashup" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Save ALL PDFs to cashup_documents + cross-validate ──
    const validations: Array<{ filename: string; type: ReportType; extracted: number | null; cashupValue: number | null; status: string; variance: number | null }> = [];

    for (const pdf of pdfs) {
      const isCashupSummary = pdf === summaryPdf;
      let reportInfo = pdf.info;
      let prompt: string | undefined;
      if (!isCashupSummary) {
        if (pdf.info.type === "scan") {
          prompt = buildScanPrompt(cashupDate ?? "unknown date", cashupFields);
        } else {
          prompt = SUPPORTING_REPORT_PROMPTS[pdf.info.type];
        }
      }
      let extractedData: Record<string, unknown> | null = null;
      let extractedTotal: number | null = null;
      let verificationStatus: "pending" | "verified" | "mismatch" = "pending";
      let variance: number | null = null;

      if (prompt) {
        extractedData = await callOpenAIPDF(pdf.base64, pdf.filename, prompt);
        extractedTotal = toNum(extractedData?.total);

        // For scans, reclassify based on AI-identified document type
        if (pdf.info.type === "scan" && extractedData?.classification) {
          const cls = String(extractedData.classification);
          if (cls === "cc_batch") {
            reportInfo = { type: "cc_batch", validatesField: "credit_cards", docType: "cc_batch" };
          } else if (cls === "banking_slip") {
            reportInfo = { type: "banking_slip", validatesField: "cash_banked", docType: "banking_slip" };
          } else if (cls === "cashup_summary") {
            reportInfo = { type: "cashup_summary", validatesField: null, docType: "cashup_summary" };
          }
          console.log(`Scan reclassified as: ${cls} (validates: ${reportInfo.validatesField ?? "none"})`);
        }

        if (reportInfo.validatesField && extractedTotal !== null) {
          const cashupValue = cashupFields[reportInfo.validatesField];
          const isSales = reportInfo.validatesField === "gross_turnover";
          const tolerance = isSales ? SALES_TOLERANCE : CASH_TOLERANCE;
          const result = computeVariance(extractedTotal, cashupValue, tolerance);
          verificationStatus = result.status;
          variance = result.variance;
        }

        validations.push({
          filename: pdf.filename,
          type: reportInfo.type,
          extracted: extractedTotal,
          cashupValue: reportInfo.validatesField ? cashupFields[reportInfo.validatesField] : null,
          status: verificationStatus,
          variance,
        });
      }

      const parsedData: Record<string, unknown> = isCashupSummary
        ? { source: "email", report_type: reportInfo.type, extracted_fields: cashupFields }
        : (extractedData ?? {});
      if (reportInfo.validatesField) parsedData.validates_field = reportInfo.validatesField;
      if (extractedTotal !== null) parsedData.extracted_total = extractedTotal;
      parsedData.report_type = reportInfo.type;
      parsedData.email_sender = from;

      const finalStatus = isCashupSummary ? "verified" : verificationStatus;

      // Dedup: check if doc with same filename already exists for this cashup
      const { data: existingDoc } = await supabase
        .from("cashup_documents")
        .select("id")
        .eq("cashup_id", cashupId)
        .eq("file_name", pdf.filename)
        .maybeSingle();

      const docPayload = {
        cashup_id: cashupId,
        tenant_id: branch.tenant_id,
        doc_type: reportInfo.docType,
        file_name: pdf.filename,
        file_data: `data:application/pdf;base64,${pdf.base64}`,
        file_size: pdf.size,
        parsed_data: parsedData,
        verification_status: finalStatus,
        variance_amount: isCashupSummary ? 0 : variance,
      };

      if (existingDoc) {
        const { error } = await supabase
          .from("cashup_documents")
          .update(docPayload)
          .eq("id", existingDoc.id);
        if (error) console.error(`Update failed for ${pdf.filename}:`, JSON.stringify(error));
        else console.log(`Updated: ${pdf.filename} (${reportInfo.type}, ${finalStatus})`);
      } else {
        const { error } = await supabase.from("cashup_documents").insert(docPayload);
        if (error) console.error(`Insert failed for ${pdf.filename}:`, JSON.stringify(error));
        else console.log(`Saved: ${pdf.filename} (${reportInfo.type}, ${finalStatus})`);
      }
    }

    console.log(`Processed ${pdfs.length} documents (${validations.length} validations)`);

    return new Response(JSON.stringify({
      success: true,
      branch: branch.name,
      cashup_date: cashupDate,
      cashup_id: cashupId,
      cashup_fields: cashupFields,
      total_pdfs: pdfs.length,
      validations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Inbound email error:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: String(err),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
