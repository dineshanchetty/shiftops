import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Send Notification — Edge Function
 *
 * Handles transactional email notifications for ShiftOps.
 * Currently stubbed with logging — production implementation should
 * integrate with a transactional email provider.
 *
 * Recommended providers (all have Deno/REST API support):
 *   - Resend (https://resend.com) — modern, developer-friendly, great DX
 *   - Postmark (https://postmarkapp.com) — excellent deliverability
 *   - SendGrid (https://sendgrid.com) — widely used, good free tier
 *
 * Notification types:
 *   - cashup-missing: Daily reminder when a branch hasn't submitted a cashup
 *   - roster-published: Alert staff when a new roster is published
 *   - invite: Invite a new user to join the tenant
 */

interface NotificationRequest {
  type: "cashup-missing" | "roster-published" | "invite";
  recipientEmail: string;
  data: Record<string, any>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Verify authorization — only service role or authenticated users
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: NotificationRequest = await req.json();
    const { type, recipientEmail, data } = body;

    // Validate required fields
    if (!type || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "type and recipientEmail are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!["cashup-missing", "roster-published", "invite"].includes(type)) {
      return new Response(
        JSON.stringify({ error: `Invalid notification type: ${type}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build the email content based on type
    const emailContent = buildEmailContent(type, data);

    console.log("=== SEND NOTIFICATION (STUBBED) ===");
    console.log(`Type:      ${type}`);
    console.log(`To:        ${recipientEmail}`);
    console.log(`Subject:   ${emailContent.subject}`);
    console.log(`Body:      ${emailContent.body.substring(0, 200)}...`);
    console.log("===================================");

    // -----------------------------------------------------------------------
    // PRODUCTION IMPLEMENTATION — Resend (recommended)
    //
    // 1. Set RESEND_API_KEY in Supabase Edge Function secrets:
    //    supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
    //
    // 2. Replace the stub above with:
    //
    //    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    //
    //    const res = await fetch('https://api.resend.com/emails', {
    //      method: 'POST',
    //      headers: {
    //        'Authorization': `Bearer ${RESEND_API_KEY}`,
    //        'Content-Type': 'application/json',
    //      },
    //      body: JSON.stringify({
    //        from: 'ShiftOps <notifications@yourdomain.com>',
    //        to: [recipientEmail],
    //        subject: emailContent.subject,
    //        html: emailContent.body,
    //      }),
    //    });
    //
    //    if (!res.ok) {
    //      const errBody = await res.text();
    //      console.error('Resend API error:', errBody);
    //      return new Response(
    //        JSON.stringify({ error: 'Failed to send email' }),
    //        { status: 502, headers: { 'Content-Type': 'application/json' } }
    //      );
    //    }
    //
    //    const result = await res.json();
    //    return new Response(
    //      JSON.stringify({ success: true, messageId: result.id }),
    //      { headers: { 'Content-Type': 'application/json' } }
    //    );
    // -----------------------------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        stubbed: true,
        message: `Notification '${type}' would be sent to ${recipientEmail}`,
        email: {
          subject: emailContent.subject,
          recipientEmail,
          type,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Notification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function buildEmailContent(
  type: string,
  data: Record<string, any>
): { subject: string; body: string } {
  switch (type) {
    case "cashup-missing":
      return {
        subject: `Cashup Missing — ${data.branchName ?? "Branch"} (${data.date ?? "today"})`,
        body: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#6c5ce7;">Daily Cashup Reminder</h2>
            <p>Hi ${data.managerName ?? "Manager"},</p>
            <p>The daily cashup for <strong>${data.branchName ?? "your branch"}</strong> on
               <strong>${data.date ?? "today"}</strong> has not been submitted yet.</p>
            <p>Please log in to ShiftOps and complete the cashup at your earliest convenience.</p>
            <a href="${data.appUrl ?? "#"}" style="display:inline-block;background:#6c5ce7;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px;">Open ShiftOps</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px;">This is an automated reminder from ShiftOps.</p>
          </div>`,
      };

    case "roster-published":
      return {
        subject: `New Roster Published — ${data.branchName ?? "Branch"} (${data.period ?? ""})`,
        body: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#6c5ce7;">Roster Published</h2>
            <p>Hi ${data.staffName ?? "Team"},</p>
            <p>A new roster has been published for <strong>${data.branchName ?? "your branch"}</strong>
               covering <strong>${data.period ?? "the upcoming period"}</strong>.</p>
            <p>Log in to ShiftOps to view your shifts.</p>
            <a href="${data.appUrl ?? "#"}" style="display:inline-block;background:#6c5ce7;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px;">View Roster</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px;">This is an automated notification from ShiftOps.</p>
          </div>`,
      };

    case "invite":
      return {
        subject: `You've been invited to ShiftOps — ${data.tenantName ?? ""}`,
        body: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#6c5ce7;">You're Invited!</h2>
            <p>Hi,</p>
            <p><strong>${data.inviterName ?? "Your manager"}</strong> has invited you to join
               <strong>${data.tenantName ?? "their team"}</strong> on ShiftOps.</p>
            <p>ShiftOps is a franchise operations platform for managing rosters, daily cashups, and reports.</p>
            <p>Click below to accept the invitation and set up your account:</p>
            <a href="${data.inviteUrl ?? "#"}" style="display:inline-block;background:#6c5ce7;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px;">Accept Invitation</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px;">This invitation expires in 7 days.</p>
          </div>`,
      };

    default:
      return {
        subject: "ShiftOps Notification",
        body: `<p>You have a new notification from ShiftOps.</p>`,
      };
  }
}
