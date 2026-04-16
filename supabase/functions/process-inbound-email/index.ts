import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Process Inbound Email — Edge Function
 *
 * SendGrid Inbound Parse webhook → parse CSV attachment → upsert daily_cashups
 * Branch identified by +tag in recipient address (e.g. aura+abc123@aura.shiftops.co.za)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAPPABLE_CASHUP_FIELDS = [
  "gross_turnover",
  "discounts",
  "delivery_charges",
  "credit_cards",
  "debtors",
  "stock_take",
  "drinks_stock_take",
  "tx_count",
  "tx_collect",
  "tx_delivery",
] as const;

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const formData = await req.formData();
    const from = formData.get("from")?.toString() ?? "";
    const subject = formData.get("subject")?.toString() ?? "";
    const toAddress = formData.get("to")?.toString() ?? "";
    const numAttachments = parseInt(formData.get("attachments")?.toString() ?? "0");

    console.log(`Inbound: from=${from}, to=${toAddress}, subject="${subject}", attachments=${numAttachments}`);

    // Extract +tag from recipient
    const codeMatch = toAddress.match(/\+([a-z0-9]+)@/i);
    const emailCode = codeMatch?.[1]?.toLowerCase();

    if (!emailCode) {
      console.error("No +tag in recipient:", toAddress);
      return new Response(JSON.stringify({
        success: false,
        error: "Recipient missing branch code. Use format: aura+<code>@aura.shiftops.co.za",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Look up branch by email_code
    const { data: branch, error: branchErr } = await supabase
      .from("branches")
      .select("id, name, tenant_id")
      .eq("email_code", emailCode)
      .maybeSingle();

    if (branchErr || !branch) {
      console.error("Branch lookup failed for code:", emailCode, branchErr?.message);
      return new Response(JSON.stringify({
        success: false,
        error: `No branch found for code '${emailCode}'`,
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Matched branch: ${branch.name} (${branch.id})`);

    if (numAttachments === 0) {
      console.log("No attachments — ignoring");
      return new Response(JSON.stringify({ success: true, message: "No attachments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse attachment-info for filenames
    const attachmentInfoStr = formData.get("attachment-info")?.toString();
    let attachmentInfo: Record<string, { filename: string; type: string }> = {};
    if (attachmentInfoStr) {
      try { attachmentInfo = JSON.parse(attachmentInfoStr); } catch { /* ignore */ }
    }

    // Find CSV attachment
    let csvContent: string | null = null;
    let csvFilename = "email-import.csv";
    for (let i = 1; i <= numAttachments; i++) {
      const att = formData.get(`attachment${i}`);
      if (!att) continue;
      const info = attachmentInfo[`attachment${i}`];
      const fname = info?.filename ?? `attachment${i}`;
      const ctype = info?.type ?? "";
      if (fname.toLowerCase().endsWith(".csv") || fname.toLowerCase().endsWith(".tsv") ||
          ctype.includes("csv") || ctype.includes("text/plain")) {
        csvContent = att instanceof File ? await att.text() : att.toString();
        csvFilename = fname;
        break;
      }
    }

    if (!csvContent) {
      console.log("No CSV attachment found");
      await supabase.from("aura_imports").insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        source_file: "email",
        status: "failed",
        error_log: "Email had attachments but no CSV found",
        raw_data: { sender: from, subject },
      });
      return new Response(JSON.stringify({ success: false, error: "No CSV attachment" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found CSV: ${csvFilename} (${csvContent.length} bytes)`);

    // Parse CSV
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return new Response(JSON.stringify({ success: false, error: "CSV has no data rows" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

    // Load field mappings — prefer branch-specific, fall back to tenant default
    const { data: mappingRows } = await supabase
      .from("aura_field_mappings")
      .select("shiftops_field, csv_column, branch_id")
      .eq("tenant_id", branch.tenant_id)
      .or(`branch_id.eq.${branch.id},branch_id.is.null`);

    const mappings = (mappingRows ?? []) as { shiftops_field: string; csv_column: string; branch_id: string | null }[];

    // Prefer branch-specific over tenant-wide
    const fieldMap: Record<string, string> = {};
    for (const m of mappings) {
      if (m.branch_id === branch.id) fieldMap[m.shiftops_field] = m.csv_column;
    }
    for (const m of mappings) {
      if (m.branch_id === null && !fieldMap[m.shiftops_field]) {
        fieldMap[m.shiftops_field] = m.csv_column;
      }
    }

    if (Object.keys(fieldMap).length === 0) {
      console.error("No field mappings configured");
      await supabase.from("aura_imports").insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        source_file: csvFilename,
        status: "failed",
        error_log: "No field mappings. Upload a CSV manually in the app first to configure mappings.",
        raw_data: { sender: from, subject },
      });
      return new Response(JSON.stringify({
        success: false,
        error: "No field mappings. Please upload a CSV manually first via /app/aura-upload to set up mappings.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Using mappings: ${JSON.stringify(fieldMap)}`);

    // Process each row
    let imported = 0;
    let errors = 0;
    const errorLogs: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
      if (values.length < 2) continue;

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

      // Extract date
      const dateCol = fieldMap["date"];
      const dateVal = dateCol ? row[dateCol] : null;
      if (!dateVal) continue;

      let parsedDate: string | null = null;
      const ds = dateVal.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(ds)) parsedDate = ds.slice(0, 10);
      else if (/^\d{2}\/\d{2}\/\d{4}/.test(ds)) {
        const [d, m, y] = ds.split("/");
        parsedDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      if (!parsedDate) continue;

      // Build mapped data
      const mappedData: Record<string, number> = {};
      for (const field of MAPPABLE_CASHUP_FIELDS) {
        const colName = fieldMap[field];
        if (!colName || !row[colName]) continue;
        const num = parseFloat(row[colName].replace(/[^0-9.-]/g, ""));
        if (!isNaN(num)) mappedData[field] = num;
      }

      // Create aura_imports record for this row
      const { data: importRec } = await supabase
        .from("aura_imports")
        .insert({
          tenant_id: branch.tenant_id,
          branch_id: branch.id,
          source_file: csvFilename,
          import_date: parsedDate,
          status: "processing",
          raw_data: { ...mappedData, email_sender: from, email_subject: subject },
        })
        .select("id")
        .single();

      // Upsert cashup
      const { data: existing } = await supabase
        .from("daily_cashups")
        .select("id")
        .eq("branch_id", branch.id)
        .eq("date", parsedDate)
        .maybeSingle();

      let cashupErr: { message: string } | null = null;
      if (existing) {
        const { error } = await supabase
          .from("daily_cashups")
          .update({ ...mappedData, aura_import_id: importRec?.id })
          .eq("id", existing.id);
        cashupErr = error;
      } else {
        const { error } = await supabase
          .from("daily_cashups")
          .insert({
            tenant_id: branch.tenant_id,
            branch_id: branch.id,
            date: parsedDate,
            status: "imported",
            aura_import_id: importRec?.id,
            ...mappedData,
          });
        cashupErr = error;
      }

      if (cashupErr) {
        errors++;
        errorLogs.push(`Row ${i} (${parsedDate}): ${cashupErr.message}`);
        if (importRec) {
          await supabase.from("aura_imports")
            .update({ status: "failed", error_log: cashupErr.message })
            .eq("id", importRec.id);
        }
      } else {
        imported++;
        if (importRec) {
          await supabase.from("aura_imports")
            .update({ status: "completed", parsed_at: new Date().toISOString() })
            .eq("id", importRec.id);
        }
      }
    }

    console.log(`Email import done: ${imported} imported, ${errors} errors`);

    return new Response(JSON.stringify({
      success: true,
      branch: branch.name,
      imported,
      errors,
      errorLogs: errors > 0 ? errorLogs.slice(0, 5) : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Inbound email error:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: String(err),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
