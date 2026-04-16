import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Process Inbound Email — Edge Function
 *
 * Webhook endpoint for SendGrid Inbound Parse.
 * When an email is sent to aura@shiftops.co.za:
 * 1. Extracts CSV attachment
 * 2. Parses CSV using saved field mappings
 * 3. Upserts into daily_cashups
 * 4. Logs to aura_imports
 *
 * SendGrid sends multipart/form-data with fields:
 *   - from, to, subject, text, html
 *   - attachments (number of attachments)
 *   - attachment1, attachment2, etc. (file data)
 *   - attachment-info (JSON with filename, type, etc.)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // SendGrid sends multipart/form-data
    const formData = await req.formData();

    const from = formData.get("from")?.toString() ?? "";
    const subject = formData.get("subject")?.toString() ?? "";
    const attachmentInfo = formData.get("attachment-info")?.toString();
    const numAttachments = parseInt(formData.get("attachments")?.toString() ?? "0");

    console.log(`Inbound email from: ${from}, subject: ${subject}, attachments: ${numAttachments}`);

    if (numAttachments === 0) {
      console.log("No attachments found — ignoring email");
      return new Response(JSON.stringify({ success: true, message: "No attachments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse attachment info
    let attachments: Record<string, { filename: string; type: string }> = {};
    if (attachmentInfo) {
      try {
        attachments = JSON.parse(attachmentInfo);
      } catch {
        console.error("Failed to parse attachment-info");
      }
    }

    // Find CSV attachment
    let csvContent: string | null = null;
    let csvFilename: string = "unknown.csv";

    for (let i = 1; i <= numAttachments; i++) {
      const attachment = formData.get(`attachment${i}`);
      if (!attachment) continue;

      // Check if it's a CSV by filename or content type
      const info = attachments[`attachment${i}`];
      const filename = info?.filename ?? `attachment${i}`;
      const contentType = info?.type ?? "";

      if (
        filename.toLowerCase().endsWith(".csv") ||
        filename.toLowerCase().endsWith(".tsv") ||
        contentType.includes("csv") ||
        contentType.includes("text/plain")
      ) {
        if (attachment instanceof File) {
          csvContent = await attachment.text();
        } else {
          csvContent = attachment.toString();
        }
        csvFilename = filename;
        break;
      }
    }

    if (!csvContent) {
      console.log("No CSV attachment found");
      return new Response(JSON.stringify({ success: true, message: "No CSV found in attachments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found CSV: ${csvFilename} (${csvContent.length} bytes)`);

    // Parse CSV
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      console.log("CSV has no data rows");
      return new Response(JSON.stringify({ success: true, message: "CSV empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = firstLine.includes("\t") ? "\t" : ",";
    const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

    // Identify branch from recipient's +tag (e.g. aura+abc123@aura.shiftops.co.za)
    const toAddress = formData.get("to")?.toString() ?? "";
    const codeMatch = toAddress.match(/\+([a-z0-9]+)@/i);
    const emailCode = codeMatch?.[1]?.toLowerCase();

    console.log(`Recipient: ${toAddress}, extracted code: ${emailCode}`);

    if (!emailCode) {
      console.error("No +tag found in recipient address:", toAddress);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Recipient address missing branch code (e.g. aura+<code>@aura.shiftops.co.za)"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: matchedBranch } = await supabase
      .from("branches")
      .select("id, name, tenant_id")
      .eq("email_code", emailCode)
      .maybeSingle();

    if (!matchedBranch) {
      console.error("No branch found for code:", emailCode);
      return new Response(
        JSON.stringify({
          success: false,
          error: `No branch found for code '${emailCode}'. Check the alias in Settings > Branches > Aura tab.`
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Matched branch: ${matchedBranch.name} (${matchedBranch.id})`);

    // Look up field mappings — prefer branch-specific, fall back to tenant default
    const { data: mappingRows } = await supabase
      .from("aura_field_mappings")
      .select("*")
      .eq("tenant_id", matchedBranch.tenant_id)
      .or(`branch_id.eq.${matchedBranch.id},branch_id.is.null`)
      .order("branch_id", { ascending: false, nullsFirst: false })
      .limit(1);

    const mappings = mappingRows?.[0] ?? null;

    if (!mappings) {
      console.error("No field mappings configured for tenant");
      // Create import log entry
      await supabase.from("aura_imports").insert({
        tenant_id: matchedBranch.tenant_id,
        branch_id: matchedBranch.id,
        file_name: csvFilename,
        source: "email",
        status: "failed",
        error_message: "No field mappings configured. Please upload a CSV manually first to set up mappings.",
      });

      return new Response(JSON.stringify({ success: false, error: "No field mappings" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse data rows using field mappings
    const fieldMap = mappings.mappings as Record<string, string>; // { "gross_turnover": "CSV Column Name", ... }
    let importedCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
      if (values.length < 2) continue;

      // Build a row object from headers + values
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? "";
      });

      // Extract date
      const dateField = fieldMap["date"];
      const dateVal = dateField ? row[dateField] : null;
      if (!dateVal) continue;

      // Parse date (try multiple formats)
      let parsedDate: string | null = null;
      const dateStr = dateVal.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        parsedDate = dateStr.slice(0, 10);
      } else if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
        const [d, m, y] = dateStr.split("/");
        parsedDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }

      if (!parsedDate) continue;

      // Extract numeric fields
      const getNum = (field: string): number | null => {
        const colName = fieldMap[field];
        if (!colName || !row[colName]) return null;
        const val = parseFloat(row[colName].replace(/[^0-9.-]/g, ""));
        return isNaN(val) ? null : val;
      };

      const cashupData = {
        tenant_id: matchedBranch.tenant_id,
        branch_id: matchedBranch.id,
        date: parsedDate,
        gross_turnover: getNum("gross_turnover"),
        cash_banked: getNum("cash_banked"),
        credit_cards: getNum("credit_cards"),
        discounts: getNum("discounts"),
        delivery_charges: getNum("delivery_charges"),
        debtors: getNum("debtors"),
        over_ring: getNum("over_ring"),
        payouts: getNum("payouts"),
        online_orders_total: getNum("online_orders_total"),
        staff_meals: getNum("staff_meals"),
      };

      // Upsert: check if entry exists for this date + branch
      const { data: existing } = await supabase
        .from("daily_cashups")
        .select("id")
        .eq("branch_id", matchedBranch.id)
        .eq("date", parsedDate)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("daily_cashups")
          .update(cashupData)
          .eq("id", existing.id);
        if (error) { errorCount++; console.error("Update error:", error.message); }
        else importedCount++;
      } else {
        const { error } = await supabase
          .from("daily_cashups")
          .insert(cashupData);
        if (error) { errorCount++; console.error("Insert error:", error.message); }
        else importedCount++;
      }
    }

    // Log the import
    await supabase.from("aura_imports").insert({
      tenant_id: matchedBranch.tenant_id,
      branch_id: matchedBranch.id,
      file_name: csvFilename,
      source: "email",
      status: errorCount > 0 ? "partial" : "completed",
      rows_imported: importedCount,
      rows_failed: errorCount,
      sender_email: from,
    });

    console.log(`Import complete: ${importedCount} rows imported, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ success: true, imported: importedCount, errors: errorCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Inbound email processing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
