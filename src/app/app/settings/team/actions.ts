"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireOwner } from "@/lib/permissions";

export type TeamRole = "owner" | "manager";

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  role: TeamRole;
  branch_ids: string[];
  is_self: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  pending_invite: boolean;
}

/**
 * List all members of the caller's tenant. Owner-only.
 *
 * Joins tenant_members → auth.users via the service-role client to surface
 * email + last-sign-in-at, which RLS hides from the regular client. If
 * SUPABASE_SERVICE_ROLE_KEY is not configured we still return the member
 * list — just without emails — and set serviceUnavailable so the UI can
 * tell the admin to add the env var.
 */
export async function listTeamMembers(): Promise<
  | { ok: true; members: TeamMember[]; serviceUnavailable?: boolean }
  | { ok: false; error: string }
> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const { data: members, error } = await supabase
    .from("tenant_members")
    .select("id, user_id, role, branch_ids, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  // Try the admin API for emails. If the env var isn't set OR the call errors,
  // fall back to a list without emails rather than blowing up the whole page.
  const byUserId = new Map<
    string,
    { email: string; last_sign_in_at: string | null; confirmed_at: string | null }
  >();
  let serviceUnavailable = false;

  try {
    const service = createServiceClient();
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error: listErr } = await service.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) {
        serviceUnavailable = true;
        break;
      }
      if (!data.users || data.users.length === 0) break;
      for (const u of data.users) {
        byUserId.set(u.id, {
          email: u.email ?? "(no email)",
          last_sign_in_at: u.last_sign_in_at ?? null,
          confirmed_at: u.email_confirmed_at ?? u.confirmed_at ?? null,
        });
      }
      if (data.users.length < 200) break;
      page += 1;
    }
  } catch {
    serviceUnavailable = true;
  }

  const result: TeamMember[] = (members ?? []).map((m) => {
    const u = byUserId.get(m.user_id);
    return {
      id: m.id,
      user_id: m.user_id,
      email: u?.email ?? (m.user_id === user.id ? user.email ?? "(you)" : "(email unavailable)"),
      role: m.role as TeamRole,
      branch_ids: m.branch_ids ?? [],
      is_self: m.user_id === user.id,
      created_at: m.created_at,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      pending_invite: u ? !u.confirmed_at && !u.last_sign_in_at : false,
    };
  });

  return { ok: true, members: result, serviceUnavailable };
}

/**
 * Invite a new user by email and add them to the tenant with the chosen role.
 * Owner-only.
 *
 * - If the email is already an auth user: just attaches them as a tenant member.
 * - If not: sends an invite email (Supabase auth.admin.inviteUserByEmail) and
 *   pre-creates the tenant_members row so they land in this tenant on signup.
 */
export async function inviteTeamMember(
  email: string,
  role: TeamRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (role !== "owner" && role !== "manager") {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return {
      ok: false,
      error:
        "Email invites require SUPABASE_SERVICE_ROLE_KEY in your Azure env vars. See the warning at the top of this page.",
    };
  }

  // Does this email already have an auth user?
  let targetUserId: string | null = null;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error: listErr } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (listErr) return { ok: false, error: listErr.message };
    if (!data.users || data.users.length === 0) break;
    const match = data.users.find((u) => u.email?.toLowerCase() === trimmed);
    if (match) {
      targetUserId = match.id;
      break;
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  if (!targetUserId) {
    // Create the auth user + magic invite link via the admin API.
    // We deliberately do NOT call inviteUserByEmail — that goes via Supabase's
    // default SMTP which is heavily rate-limited and frequently silently drops
    // mail. Instead we generate the link and dispatch the email ourselves via
    // SendGrid (the same pipeline that already handles inbound + reminders).
    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type: "invite",
      email: trimmed,
    });
    if (linkErr || !linkData?.user) {
      return {
        ok: false,
        error: linkErr?.message ?? "Failed to create invite link.",
      };
    }
    targetUserId = linkData.user.id;

    // Look up the tenant name + the inviter's name to make the email nicer.
    const [{ data: tenantRow }, { data: { user: inviter } }] = await Promise.all([
      service.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const tenantName = tenantRow?.name ?? "ShiftOps";
    const inviterName =
      (inviter?.user_metadata?.full_name as string | undefined) ??
      (inviter?.user_metadata?.name as string | undefined) ??
      inviter?.email ??
      "Your team";

    // Fire-and-forget: even if SendGrid hiccups, the user can still be invited
    // again from the same page. Don't fail the whole action over a transient
    // email error — the tenant_members row insert below is what actually grants
    // access and that's still happening atomically.
    const inviteUrl = linkData.properties?.action_link;
    if (inviteUrl) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Edge function requires a Bearer token; the service-role key works.
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            type: "invite",
            recipientEmail: trimmed,
            data: {
              tenantName,
              inviterName,
              inviteUrl,
              role: role === "owner" ? "Admin" : "Manager",
            },
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error("send-notification failed:", res.status, errText);
        }
      } catch (e) {
        console.error("send-notification dispatch error:", e);
      }
    }
  }

  // Check for an existing membership first to avoid noisy unique-constraint errors.
  const { data: existing } = await service
    .from("tenant_members")
    .select("id, tenant_id, role")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existing) {
    if (existing.tenant_id !== tenantId) {
      return {
        ok: false,
        error: "This user already belongs to another tenant.",
      };
    }
    // Already on this tenant — update role idempotently.
    const { error: updErr } = await service
      .from("tenant_members")
      .update({ role })
      .eq("id", existing.id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insErr } = await service
      .from("tenant_members")
      .insert({ tenant_id: tenantId, user_id: targetUserId, role });
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/app/settings/team");
  return { ok: true };
}

/**
 * Create a team member by hand with a system-generated temporary password.
 * No email is sent — owner shows the credentials to the user out-of-band.
 * The user is flagged as `must_change_password=true` and will be forced into
 * the password-reset flow on first sign-in.
 *
 * Returns the email + temp password in the success payload so the owner can
 * copy them. After dismissing the dialog the password CANNOT be retrieved —
 * if lost, the owner has to recreate or reset the user.
 */
export async function createTeamMemberWithPassword(
  email: string,
  role: TeamRole,
  fullName?: string
): Promise<
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string }
> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (role !== "owner" && role !== "manager") {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return {
      ok: false,
      error:
        "Manual user creation requires SUPABASE_SERVICE_ROLE_KEY in your env vars. See the warning at the top of this page.",
    };
  }

  // Generate a memorable but secure temp password.
  // Pattern: ShiftOps-XXXX-XXXX (case-mixed letters + digits, no ambiguous chars).
  // Long enough to clear Supabase's default 6-char min and any tightened policy.
  const tempPassword = generateTempPassword();

  // Does an auth user already exist for this email?
  let targetUserId: string | null = null;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error: listErr } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) return { ok: false, error: listErr.message };
    if (!data.users || data.users.length === 0) break;
    const match = data.users.find((u) => u.email?.toLowerCase() === trimmed);
    if (match) {
      targetUserId = match.id;
      break;
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  if (targetUserId) {
    // Existing user: reset their password to the new temp + mark must-change.
    const { error: updErr } = await service.auth.admin.updateUserById(targetUserId, {
      password: tempPassword,
      user_metadata: {
        full_name: fullName?.trim() || undefined,
        must_change_password: true,
      },
    });
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    // New user: create with confirmed email so they can sign in immediately.
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email: trimmed,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName?.trim() || undefined,
        must_change_password: true,
      },
    });
    if (createErr || !created?.user) {
      return { ok: false, error: createErr?.message ?? "Failed to create user." };
    }
    targetUserId = created.user.id;
  }

  // Attach to this tenant (or update role if they're already a member).
  const { data: existing } = await service
    .from("tenant_members")
    .select("id, tenant_id, role")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existing) {
    if (existing.tenant_id !== tenantId) {
      return { ok: false, error: "This user already belongs to another tenant." };
    }
    await service.from("tenant_members").update({ role }).eq("id", existing.id);
  } else {
    const { error: insErr } = await service
      .from("tenant_members")
      .insert({ tenant_id: tenantId, user_id: targetUserId, role });
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/app/settings/team");
  return { ok: true, email: trimmed, tempPassword };
}

/** Cryptographically random 12-char password — avoids look-alike chars 0/O, 1/l/I. */
function generateTempPassword(): string {
  const alphabet =
    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out; // e.g. "k7Hj-9MnP-zQ4R"
}

export async function updateTeamMemberRole(
  memberId: string,
  role: TeamRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  // Fetch the target member
  const { data: target, error: tErr } = await supabase
    .from("tenant_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("tenant_id", tenantId)
    .single();
  if (tErr || !target) return { ok: false, error: "Member not found" };

  // Don't let an owner demote themselves if they're the last owner.
  if (target.user_id === user.id && target.role === "owner" && role !== "owner") {
    const { count } = await supabase
      .from("tenant_members")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "You're the last Admin — promote someone else first.",
      };
    }
  }

  const { error } = await supabase
    .from("tenant_members")
    .update({ role })
    .eq("id", memberId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/team");
  return { ok: true };
}

/**
 * Set which branches a team member can access. Owner-only.
 *
 * Owners always see every branch regardless of branch_ids (enforced by
 * is_owner() in SQL and the front-end), so saving branch_ids on an owner
 * is allowed but has no effect — we still store it in case the user is
 * later demoted.
 *
 * Passing an empty list means "no branches" — a manager will see an
 * empty branch selector. Pass null / all branches to mean "all".
 */
export async function updateTeamMemberBranches(
  memberId: string,
  branchIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  // Sanity-check: every supplied branch belongs to this tenant.
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", branchIds);
    const valid = new Set((branches ?? []).map((b) => b.id as string));
    const bad = branchIds.filter((id) => !valid.has(id));
    if (bad.length > 0) {
      return { ok: false, error: "One or more branches don't belong to this tenant." };
    }
  }

  const { error } = await supabase
    .from("tenant_members")
    .update({ branch_ids: branchIds })
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/team");
  return { ok: true };
}

export async function removeTeamMember(
  memberId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOwner();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { ok: false, error: "No tenant found" };

  const { data: target } = await supabase
    .from("tenant_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("tenant_id", tenantId)
    .single();
  if (!target) return { ok: false, error: "Member not found" };

  if (target.user_id === user.id) {
    return { ok: false, error: "You can't remove yourself." };
  }

  if (target.role === "owner") {
    const { count } = await supabase
      .from("tenant_members")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Can't remove the last Admin.",
      };
    }
  }

  const { error } = await supabase
    .from("tenant_members")
    .delete()
    .eq("id", memberId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/team");
  return { ok: true };
}
