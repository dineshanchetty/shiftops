"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  type TeamMember,
  type TeamRole,
} from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Loader2, Mail, Trash2, Shield, ShieldCheck } from "lucide-react";

interface TeamPanelProps {
  initialMembers: TeamMember[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TeamPanel({ initialMembers }: TeamPanelProps) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("manager");
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);

  function refresh() {
    // The action revalidatePath()s, but we're a client component — round-trip
    // via router.refresh() to pull the new server-rendered list.
    router.refresh();
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await inviteTeamMember(email, inviteRole);
      if (res.ok) {
        setFeedback({
          type: "ok",
          text: `Invite sent to ${email}. They'll receive an email to set their password.`,
        });
        setEmail("");
        setInviteRole("manager");
        refresh();
      } else {
        setFeedback({ type: "err", text: res.error });
      }
    });
  }

  function handleRoleChange(member: TeamMember, role: TeamRole) {
    if (role === member.role) return;
    setFeedback(null);
    // Optimistic
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role } : m))
    );
    startTransition(async () => {
      const res = await updateTeamMemberRole(member.id, role);
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error });
        // Revert
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, role: member.role } : m))
        );
      } else {
        refresh();
      }
    });
  }

  function handleRemove(member: TeamMember) {
    if (!confirm(`Remove ${member.email} from the team? They'll lose access immediately.`)) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await removeTeamMember(member.id);
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        setFeedback({ type: "ok", text: `${member.email} removed.` });
        refresh();
      } else {
        setFeedback({ type: "err", text: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Invite card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Mail size={20} />
            </div>
            <div>
              <CardTitle>Invite someone</CardTitle>
              <CardDescription className="mt-1">
                They&apos;ll get an email to set their password and land directly in your tenant.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleInvite}
            className="flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="flex-1">
              <label className="text-xs font-medium text-base-600 block mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={busy}
                className="w-full h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
              />
            </div>
            <div className="sm:w-[180px]">
              <label className="text-xs font-medium text-base-600 block mb-1.5">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                disabled={busy}
                className="w-full h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
              >
                <option value="manager">Manager (input only)</option>
                <option value="owner">Admin (full control)</option>
              </select>
            </div>
            <Button type="submit" disabled={busy || !email}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />}
              Send invite
            </Button>
          </form>

          {feedback && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                feedback.type === "ok"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {feedback.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle>Team members ({members.length})</CardTitle>
          <CardDescription className="mt-1">
            Change a role with the dropdown. Removing someone revokes their access immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-200 bg-surface-2">
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">
                    Role
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400 hidden md:table-cell">
                    Last sign-in
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400 hidden md:table-cell">
                    Added
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-base-200 last:border-b-0 hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-base-900">{m.email}</span>
                        {m.is_self && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                        {m.pending_invite && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            Invite pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m.role === "owner" ? (
                          <ShieldCheck size={14} className="text-accent" />
                        ) : (
                          <Shield size={14} className="text-base-400" />
                        )}
                        <select
                          value={m.role}
                          onChange={(e) =>
                            handleRoleChange(m, e.target.value as TeamRole)
                          }
                          disabled={busy}
                          className="h-8 px-2 rounded border border-base-200 bg-white text-xs text-base-900 outline-none focus:border-accent"
                        >
                          <option value="manager">Manager</option>
                          <option value="owner">Admin</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-base-600 hidden md:table-cell">
                      {formatDate(m.last_sign_in_at)}
                    </td>
                    <td className="px-4 py-3 text-base-600 hidden md:table-cell">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!m.is_self && (
                        <button
                          onClick={() => handleRemove(m)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                          title="Remove from team"
                        >
                          <Trash2 size={13} />
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-base-200 bg-surface-2/40 px-4 py-3 text-xs text-base-600">
        <strong className="text-base-700">Role reference:</strong>{" "}
        <strong>Admin</strong> = full control (Settings, unlock posted cashups, edit hourly rates, manage team).{" "}
        <strong>Manager</strong> = input data only (cashup, roster, staff hours) — cannot access Settings or unlock posted cashups.
      </div>
    </div>
  );
}
