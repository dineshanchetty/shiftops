import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Parse Cashup Document — Edge Function
 *
 * Uses OpenAI GPT-4o Vision API to extract totals from uploaded cashup documents:
 *   - cc_batch: Credit card batch settlement report → extract total CC amount
 *   - banking_slip: Bank deposit slip → extract deposit total
 *   - cashup_summary: POS cashup summary → extract key figures
 *
 * Returns: { amount, confidence, rawText, breakdown }
 */

interface ParseRequest {
  imageBase64: string;
  mimeType: string;
  docType: "cc_batch" | "banking_slip" | "cashup_summary" | "stock_report" | "other";
}

interface ParseResult {
  amount: number | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
  breakdown?: Record<string, number>;
  error?: string;
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const DOC_PROMPTS: Record<string, string> = {
  cc_batch: `You are analyzing a credit card batch settlement report from a restaurant or franchise.
Extract the TOTAL credit card amount processed. Look for fields like "Total", "Batch Total", "Settlement Amount", "Net Amount", or similar.
If there are multiple card types (Visa, Mastercard, Amex), sum them all.
Return the total amount as a number.`,

  banking_slip: `You are analyzing a bank deposit slip from a restaurant or franchise.
Extract the TOTAL deposit amount. Look for fields like "Total", "Deposit Total", "Amount", or the final sum.
If there are multiple items, find the grand total.
Return the total amount as a number.`,

  cashup_summary: `You are analyzing a POS cashup/end-of-day summary report from a restaurant.
Extract ALL relevant financial figures. Look for:
- Gross turnover / Total sales
- Cash amount
- Credit card total
- Discounts
- Delivery charges
Return each as a named amount.`,

  stock_report: `You are analyzing a stock/inventory report from a restaurant.
Extract the total stock value or cost amount if visible.
Return the total amount as a number.`,

  other: `You are analyzing a financial document from a restaurant or franchise.
Extract any monetary totals or key financial figures visible in the document.
Return the primary total amount as a number.`,
};

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  try {
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ParseRequest = await req.json();
    const { imageBase64, mimeType, docType } = body;

    if (!imageBase64 || !docType) {
      return new Response(
        JSON.stringify({ error: "imageBase64 and docType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = DOC_PROMPTS[docType] ?? DOC_PROMPTS.other;

    // Build data URL for OpenAI
    const safeMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
    const dataUrl = `data:${safeMime};base64,${imageBase64}`;

    // Call OpenAI GPT-4o Vision API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
            role: "system",
            content: `You are a financial document analyzer for a South African restaurant franchise.
All amounts are in South African Rands (ZAR), without currency symbols.
Respond ONLY in this exact JSON format:
{
  "amount": <number or null if not found>,
  "confidence": "high" | "medium" | "low",
  "rawText": "<brief description of what you found>",
  "breakdown": { "<label>": <number>, ... }
}
Use "high" confidence if the total is clearly visible and unambiguous.
Use "medium" if you had to calculate or interpret.
Use "low" if you're guessing or the document is unclear.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: systemPrompt,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: "Vision API failed", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const textContent = openaiData.choices?.[0]?.message?.content ?? "";

    // Parse the JSON response
    let result: ParseResult;
    try {
      const parsed = JSON.parse(textContent);
      result = {
        amount: typeof parsed.amount === "number" ? parsed.amount : null,
        confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
        rawText: parsed.rawText ?? textContent.slice(0, 200),
        breakdown: parsed.breakdown ?? undefined,
      };
    } catch {
      result = {
        amount: null,
        confidence: "low",
        rawText: textContent.slice(0, 200),
        error: "Failed to parse vision model response as JSON",
      };
    }

    console.log(`Document parsed: ${docType} → amount=${result.amount}, confidence=${result.confidence}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Parse error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
