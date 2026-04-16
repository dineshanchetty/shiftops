import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Parse Cashup Document — Edge Function
 *
 * Uses Claude Vision API to extract totals from uploaded cashup documents:
 *   - cc_batch: Credit card batch settlement report → extract total CC amount
 *   - banking_slip: Bank deposit slip → extract deposit total
 *   - cashup_summary: POS cashup summary → extract key figures
 *
 * Returns: { amount, confidence, rawText, breakdown }
 */

interface ParseRequest {
  imageBase64: string; // Base64 encoded image (no data: prefix)
  mimeType: string;    // "image/jpeg", "image/png", "application/pdf"
  docType: "cc_batch" | "banking_slip" | "cashup_summary" | "stock_report" | "other";
}

interface ParseResult {
  amount: number | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
  breakdown?: Record<string, number>;
  error?: string;
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

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
  // CORS headers
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
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
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

    // Determine media type for Claude Vision
    let mediaType = mimeType;
    if (mediaType === "application/pdf") {
      // Claude supports PDF via document type
      mediaType = "application/pdf";
    }

    // Call Claude Vision API
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType.startsWith("image/") ? mediaType : "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `${systemPrompt}

IMPORTANT: Respond in this exact JSON format only, no other text:
{
  "amount": <number or null if not found>,
  "confidence": "high" | "medium" | "low",
  "rawText": "<brief description of what you found>",
  "breakdown": { "<label>": <number>, ... }
}

Use "high" confidence if the total is clearly visible and unambiguous.
Use "medium" if you had to calculate or interpret.
Use "low" if you're guessing or the document is unclear.
All amounts should be in South African Rands (ZAR), without currency symbols.`,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: "Vision API failed", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeResponse.json();
    const textContent = claudeData.content?.[0]?.text ?? "";

    // Parse the JSON response from Claude
    let result: ParseResult;
    try {
      // Extract JSON from response (Claude might wrap it in markdown)
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          amount: typeof parsed.amount === "number" ? parsed.amount : null,
          confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
          rawText: parsed.rawText ?? textContent.slice(0, 200),
          breakdown: parsed.breakdown ?? undefined,
        };
      } else {
        result = {
          amount: null,
          confidence: "low",
          rawText: textContent.slice(0, 200),
          error: "Could not parse structured response from vision model",
        };
      }
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
