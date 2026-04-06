import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Fields on daily_cashups that can be mapped from Aura CSV. */
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


interface ImportPayload {
  branchId: string;
  date: string; // YYYY-MM-DD
  mappedData: Record<string, string | number>;
  sourceFile: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ImportPayload;
    const { branchId, date, mappedData, sourceFile } = body;

    if (!branchId || !date || !mappedData) {
      return NextResponse.json(
        { error: "branchId, date, and mappedData are required" },
        { status: 400 }
      );
    }

    // Get tenant_id from the branch
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("tenant_id")
      .eq("id", branchId)
      .single();

    if (branchError || !branch) {
      return NextResponse.json(
        { error: "Branch not found" },
        { status: 404 }
      );
    }

    const tenantId = branch.tenant_id;

    // 1) Create aura_imports record
    const { data: importRecord, error: importError } = await supabase
      .from("aura_imports")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        source_file: sourceFile || "manual-upload",
        import_date: date,
        status: "processing",
        raw_data: mappedData,
      })
      .select("id")
      .single();

    if (importError || !importRecord) {
      console.error("Failed to create aura_imports record:", importError);
      return NextResponse.json(
        { error: "Failed to create import record" },
        { status: 500 }
      );
    }

    // 2) Build cashup data from mapped fields
    const cashupData: Record<string, number | null> = {};
    for (const field of MAPPABLE_CASHUP_FIELDS) {
      const value = mappedData[field];
      if (value !== undefined && value !== null && value !== "") {
        const num = typeof value === "number" ? value : parseFloat(String(value));
        cashupData[field] = isNaN(num) ? null : num;
      }
    }

    // 3) Upsert daily_cashup for this branch + date
    // Check if a cashup already exists for this branch+date
    const { data: existingCashup } = await supabase
      .from("daily_cashups")
      .select("id")
      .eq("branch_id", branchId)
      .eq("date", date)
      .single();

    let cashupId: string;

    if (existingCashup) {
      // Update existing cashup
      const { error: updateError } = await supabase
        .from("daily_cashups")
        .update({
          ...cashupData,
          aura_import_id: importRecord.id,
        })
        .eq("id", existingCashup.id);

      if (updateError) {
        // Mark import as failed
        await supabase
          .from("aura_imports")
          .update({ status: "failed", error_log: updateError.message })
          .eq("id", importRecord.id);

        return NextResponse.json(
          { error: "Failed to update cashup" },
          { status: 500 }
        );
      }
      cashupId = existingCashup.id;
    } else {
      // Create new cashup
      const { data: newCashup, error: insertError } = await supabase
        .from("daily_cashups")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          date,
          aura_import_id: importRecord.id,
          status: "imported",
          ...cashupData,
        })
        .select("id")
        .single();

      if (insertError || !newCashup) {
        await supabase
          .from("aura_imports")
          .update({ status: "failed", error_log: insertError?.message })
          .eq("id", importRecord.id);

        return NextResponse.json(
          { error: "Failed to create cashup" },
          { status: 500 }
        );
      }
      cashupId = newCashup.id;
    }

    // 4) Mark import as complete
    await supabase
      .from("aura_imports")
      .update({ status: "completed", parsed_at: new Date().toISOString() })
      .eq("id", importRecord.id);

    return NextResponse.json({
      success: true,
      cashupId,
      importId: importRecord.id,
      isUpdate: !!existingCashup,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
