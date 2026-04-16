import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Send Notification — Edge Function
 *
 * Sends transactional emails via SendGrid for:
 *   - cashup-missing: Daily reminder when a branch hasn't submitted a cashup
 *   - roster-published: Alert staff when a new roster is published
 *   - invite: Invite a new user to join the tenant
 */

interface NotificationRequest {
  type: "cashup-missing" | "roster-published" | "invite";
  recipientEmail: string;
  data: Record<string, unknown>;
}

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "notifications@shiftops.co.za";
const FROM_NAME = "ShiftOps";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: NotificationRequest = await req.json();
    const { type, recipientEmail, data } = body;

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

    const emailContent = buildEmailContent(type, data);

    if (!SENDGRID_API_KEY) {
      console.log("SENDGRID_API_KEY not set — logging email instead of sending");
      console.log(`To: ${recipientEmail} | Subject: ${emailContent.subject}`);
      return new Response(
        JSON.stringify({ success: true, stubbed: true, message: `Would send to ${recipientEmail}` }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Send via SendGrid
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipientEmail }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: emailContent.subject,
        content: [{ type: "text/html", value: emailContent.body }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("SendGrid API error:", res.status, errBody);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errBody }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const messageId = res.headers.get("X-Message-Id") ?? "unknown";
    console.log(`Email sent: ${type} → ${recipientEmail} (${messageId})`);

    return new Response(
      JSON.stringify({ success: true, messageId }),
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
  data: Record<string, unknown>
): { subject: string; body: string } {
  const baseStyle = `font-family:Inter,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border-radius:12px;`;
  const btnStyle = `display:inline-block;background:#7C3AED;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;`;
  const footerStyle = `color:#94a3b8;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;`;

  switch (type) {
    case "cashup-missing":
      return {
        subject: `⚠️ Cashup Missing — ${data.branchName ?? "Branch"} (${data.date ?? "today"})`,
        body: `<div style="${baseStyle}">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:48px;">⚠️</span>
          </div>
          <h2 style="color:#7C3AED;margin:0 0 16px;">Daily Cashup Reminder</h2>
          <p style="color:#334155;">Hi ${data.managerName ?? "Manager"},</p>
          <p style="color:#334155;">The daily cashup for <strong>${data.branchName ?? "your branch"}</strong> on
             <strong>${data.date ?? "today"}</strong> has not been submitted yet.</p>
          <p style="color:#334155;">Please log in to ShiftOps and complete the cashup at your earliest convenience.</p>
          <a href="${data.appUrl ?? "https://shiftops.co.za/app/cashup"}" style="${btnStyle}">Open Cashup</a>
          <p style="${footerStyle}">This is an automated reminder from ShiftOps.</p>
        </div>`,
      };

    case "roster-published":
      return {
        subject: `📅 New Roster Published — ${data.branchName ?? "Branch"} (${data.period ?? ""})`,
        body: `<div style="${baseStyle}">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:48px;">📅</span>
          </div>
          <h2 style="color:#7C3AED;margin:0 0 16px;">Roster Published</h2>
          <p style="color:#334155;">Hi ${data.staffName ?? "Team"},</p>
          <p style="color:#334155;">A new roster has been published for <strong>${data.branchName ?? "your branch"}</strong>
             covering <strong>${data.period ?? "the upcoming period"}</strong>.</p>
          <a href="${data.appUrl ?? "https://shiftops.co.za/app/roster"}" style="${btnStyle}">View Roster</a>
          <p style="${footerStyle}">This is an automated notification from ShiftOps.</p>
        </div>`,
      };

    case "invite":
      return {
        subject: `🎉 You're invited to ShiftOps — ${data.tenantName ?? ""}`,
        body: `<div style="${baseStyle}">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:48px;">🎉</span>
          </div>
          <h2 style="color:#7C3AED;margin:0 0 16px;">You're Invited!</h2>
          <p style="color:#334155;"><strong>${data.inviterName ?? "Your manager"}</strong> has invited you to join
             <strong>${data.tenantName ?? "their team"}</strong> on ShiftOps.</p>
          <p style="color:#334155;">ShiftOps helps manage rosters, daily cashups, and franchise operations.</p>
          <a href="${data.inviteUrl ?? "#"}" style="${btnStyle}">Accept Invitation</a>
          <p style="${footerStyle}">This invitation expires in 7 days.</p>
        </div>`,
      };

    default:
      return {
        subject: "ShiftOps Notification",
        body: `<div style="${baseStyle}"><p style="color:#334155;">You have a new notification from ShiftOps.</p></div>`,
      };
  }
}
