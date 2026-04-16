import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Process Inbound Email — Edge Function
 *
 * SendGrid Inbound Parse webhook. Handles Aura daily report PDFs.
 *
 * Flow:
 *   1. Extract +tag from recipient → lookup branch by email_code
 *   2. Iterate PDF attachments
 *   3. Primary PDF (Shop Cashup Summary) → OpenAI extracts key figures → upsert daily_cashups
 *   4. All other PDFs → save to cashup_documents linked to the cashup
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// Doc type classification based on filename keywords
function classifyDocType(filename: string): { isCashupSummary: boolean; docType: string } {
  const f = filename.toLowerCase();
  if (f.includes("cashup summary") || f.includes("cashup_summary")) return { isCashupSummary: true, docType: "cashup_summary" };
  if (f.includes("cashup detail") || f.includes("cashup_detail")) return { isCashupSummary: false, docType: "cashup_summary" };
  if (f.includes("discount")) return { isCashupSummary: false, docType: "other" };
  if (f.includes("overring") || f.includes("over ring")) return { isCashupSummary: false, docType: "other" };
  if (f.includes("stock")) return { isCashupSummary: false, docType: "stock_report" };
  if (f.includes("cc batch") || f.includes("credit card")) return { isCashupSummary: false, docType: "cc_batch" };
  if (f.includes("banking") || f.includes("deposit slip")) return { isCashupSummary: false, docType: "banking_slip" };
  return { isCashupSummary: false, docType: "other" };
}

async function parseCashupPdfWithAI(base64Pdf: string, filename: string): Promise<Record<string, number | string | null> | null> {
  const prompt = `You are analyzing a "Shop Cashup Summary" PDF from the Aura POS system for a Debonairs Pizza franchise.

Extract these specific fields and return ONLY valid JSON:
{
  "date": "YYYY-MM-DD (from report header)",
  "gross_turnover": <Gross Sales (Ex. O/R) amount>,
  "discounts": <LESS Discounts amount>,
  "delivery_charges": <ADD Delivery Charges amount>,
  "credit_cards": <Credit Cards amount>,
  "cash_banked": <Cash to be banked amount OR Cash amount>,
  "debtors": <Debtors amount>,
  "online_orders": <Online Orders amount (may be ignored)>,
  "other_payments": <Other Payments amount>,
  "overrings": <Overrings amount>,
  "confidence": "high" | "medium" | "low"
}

All amounts in South African Rands. Use 0 if a field is explicitly 0.00. Use null if a field is not present.
Date should be parsed from "From DD Month, YYYY" or "for Monday the DD Month, YYYY" in the report.`;

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
              {
                type: "file",
                file: {
                  filename,
                  file_data: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("OpenAI PDF parse failed:", resp.status, errText);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    console.log("AI raw response:", content.slice(0, 300));
    return JSON.parse(content);
  } catch (err) {
    console.error("AI parse error:", err);
    return null;
  }
}

// Helper to convert File/Blob to base64
async function fileToBase64(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({
        success: false, error: "Recipient missing branch code",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Look up branch
    const { data: branch } = await supabase
      .from("branches")
      .select("id, name, tenant_id")
      .eq("email_code", emailCode)
      .maybeSingle();

    if (!branch) {
      return new Response(JSON.stringify({
        success: false, error: `No branch found for code '${emailCode}'`,
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Matched branch: ${branch.name} (${branch.id})`);

    if (numAttachments === 0) {
      console.log("No attachments");
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

    // Collect all PDF attachments
    const pdfs: { filename: string; base64: string; size: number; file: File | Blob }[] = [];
    for (let i = 1; i <= numAttachments; i++) {
      const att = formData.get(`attachment${i}`);
      if (!att || typeof att === "string") continue;
      const info = attachmentInfo[`attachment${i}`];
      const filename = info?.filename ?? `attachment${i}.pdf`;
      const ctype = info?.type ?? "";
      if (filename.toLowerCase().endsWith(".pdf") || ctype.includes("pdf")) {
        const b64 = await fileToBase64(att);
        pdfs.push({ filename, base64: b64, size: (att as Blob).size, file: att });
      }
    }

    console.log(`Found ${pdfs.length} PDF attachment(s)`);

    if (pdfs.length === 0) {
      return new Response(JSON.stringify({
        success: false, error: "No PDF attachments found",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find the Shop Cashup Summary PDF (primary for extracting cashup figures)
    const summaryPdf = pdfs.find((p) => classifyDocType(p.filename).isCashupSummary);

    let cashupDate: string | null = null;
    let cashupId: string | null = null;
    let aiFields: Record<string, number | string | null> | null = null;

    if (summaryPdf) {
      console.log(`Parsing cashup summary: ${summaryPdf.filename}`);
      aiFields = await parseCashupPdfWithAI(summaryPdf.base64, summaryPdf.filename);

      if (aiFields && aiFields.date) {
        cashupDate = String(aiFields.date);

        // Build cashup data
        const cashupData: Record<string, number | null> = {};
        const num = (v: unknown): number | null => {
          if (v === null || v === undefined || v === "") return null;
          const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
          return isNaN(n) ? null : n;
        };
        cashupData.gross_turnover = num(aiFields.gross_turnover);
        cashupData.discounts = num(aiFields.discounts);
        cashupData.delivery_charges = num(aiFields.delivery_charges);
        cashupData.credit_cards = num(aiFields.credit_cards);
        cashupData.cash_banked = num(aiFields.cash_banked);
        cashupData.debtors = num(aiFields.debtors);

        // Create aura_imports record
        const { data: importRec } = await supabase
          .from("aura_imports")
          .insert({
            tenant_id: branch.tenant_id,
            branch_id: branch.id,
            source_file: summaryPdf.filename,
            import_date: cashupDate,
            status: "processing",
            raw_data: { ...aiFields, email_sender: from, email_subject: subject },
          })
          .select("id")
          .single();

        // Upsert daily_cashup
        const { data: existing } = await supabase
          .from("daily_cashups")
          .select("id")
          .eq("branch_id", branch.id)
          .eq("date", cashupDate)
          .maybeSingle();

        let cashupErr: { message: string } | null = null;
        if (existing) {
          const { error } = await supabase
            .from("daily_cashups")
            .update({ ...cashupData, aura_import_id: importRec?.id })
            .eq("id", existing.id);
          cashupErr = error;
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
              ...cashupData,
            })
            .select("id")
            .single();
          cashupErr = error;
          cashupId = newC?.id ?? null;
        }

        if (importRec) {
          await supabase.from("aura_imports")
            .update({
              status: cashupErr ? "failed" : "completed",
              parsed_at: new Date().toISOString(),
              error_log: cashupErr?.message,
            })
            .eq("id", importRec.id);
        }

        console.log(`Cashup ${existing ? "updated" : "created"}: ${cashupId} for ${cashupDate}`);
      } else {
        console.error("AI did not extract date from cashup summary");
      }
    } else {
      console.log("No Shop Cashup Summary PDF found in attachments");
    }

    // Save all OTHER PDFs as supporting documents (if we have a cashupId)
    let savedDocs = 0;
    if (cashupId) {
      for (const pdf of pdfs) {
        if (pdf === summaryPdf) continue; // already processed
        const { docType } = classifyDocType(pdf.filename);
        const { error } = await supabase.from("cashup_documents").insert({
          cashup_id: cashupId,
          tenant_id: branch.tenant_id,
          doc_type: docType,
          file_name: pdf.filename,
          file_data: `data:application/pdf;base64,${pdf.base64}`,
          file_size: pdf.size,
          verification_status: "pending",
        });
        if (!error) savedDocs++;
        else console.error(`Failed to save ${pdf.filename}:`, error.message);
      }
      console.log(`Saved ${savedDocs} supporting documents`);
    }

    return new Response(JSON.stringify({
      success: true,
      branch: branch.name,
      cashup_date: cashupDate,
      cashup_id: cashupId,
      ai_extracted: aiFields,
      supporting_docs_saved: savedDocs,
      total_pdfs: pdfs.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Inbound email error:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: String(err),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
