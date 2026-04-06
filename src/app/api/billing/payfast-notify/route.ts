import { NextRequest, NextResponse } from "next/server";

/**
 * PayFast ITN (Instant Transaction Notification) webhook handler
 *
 * PayFast sends POST requests to this endpoint for payment events.
 * See: https://developers.payfast.co.za/docs#step_4_confirm_payment
 *
 * ─── ITN Fields Reference ──────────────────────────────────────────────────
 *
 * Header fields:
 *   m_payment_id      — Unique payment ID (our internal reference)
 *   pf_payment_id     — PayFast payment ID
 *   payment_status    — COMPLETE | CANCELLED | PENDING
 *   item_name         — Item description
 *   item_description  — Additional description
 *   amount_gross      — Total amount
 *   amount_fee        — PayFast fee
 *   amount_net        — Net amount after fee
 *   name_first        — Buyer first name
 *   name_last         — Buyer last name
 *   email_address     — Buyer email
 *   merchant_id       — Our PayFast merchant ID
 *   signature         — MD5 signature for verification
 *
 * Subscription fields (recurring):
 *   token              — Subscription token
 *   billing_date       — Next billing date
 *   subscription_type  — 1 (subscription)
 *   frequency          — 3 (monthly), 4 (quarterly), 5 (biannually), 6 (annually)
 *   cycles             — Number of cycles (0 = indefinite)
 *   cycles_complete    — Completed cycles
 *   payment_status     — COMPLETE | CANCEL
 *
 * ─── Implementation TODO ───────────────────────────────────────────────────
 *
 * 1. Verify PayFast signature:
 *    - Collect all POST params (excluding `signature`)
 *    - Sort alphabetically, URL-encode values
 *    - Concatenate as key=value pairs with &
 *    - Append passphrase if set: &passphrase=<PASSPHRASE>
 *    - MD5 hash the string and compare with received `signature`
 *
 * 2. Verify source IP is from PayFast:
 *    - Production IPs: 197.97.145.144/28
 *    - Sandbox IPs: 197.97.145.144/28
 *
 * 3. Check payment_status:
 *    - COMPLETE  → activate/renew tenant plan
 *    - CANCEL    → downgrade to free/starter
 *    - PENDING   → log and wait
 *
 * 4. Confirm with PayFast server (recommended):
 *    - POST to https://www.payfast.co.za/eng/query/validate
 *    - With all received ITN data
 *    - Expect response: VALID or INVALID
 *
 * 5. Update tenant plan:
 *    - Parse m_payment_id for tenant_id and plan
 *    - Update tenants.plan in database
 *    - Clear trial_ends_at on upgrade
 *
 * 6. Handle subscription events:
 *    - SUBSCRIPTION → store token for future charges
 *    - CANCEL → handle graceful downgrade
 */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const data: Record<string, string> = {};
    formData.forEach((value, key) => {
      data[key] = value.toString();
    });

    // Log the ITN notification for debugging
    console.log("[PayFast ITN] Received notification:", {
      payment_status: data.payment_status,
      m_payment_id: data.m_payment_id,
      pf_payment_id: data.pf_payment_id,
      amount_gross: data.amount_gross,
      item_name: data.item_name,
    });

    // TODO: Step 1 — Verify signature
    // TODO: Step 2 — Verify source IP
    // TODO: Step 3 — Validate with PayFast server
    // TODO: Step 4 — Process payment based on status
    // TODO: Step 5 — Update tenant plan in database
    // TODO: Step 6 — Handle subscription lifecycle events

    // Return 200 OK to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[PayFast ITN] Error processing notification:", error);
    // Still return 200 to prevent PayFast from retrying
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
