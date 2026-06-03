"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTeamMemberWithPassword,
  updateTeamMemberRole,
  updateTeamMemberBranches,
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
import {
  Loader2,
  Trash2,
  Shield,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  GitBranch,
} from "lucide-react";

interface IssuedCredentials {
  email: string;
  tempPassword: string;
}

interface BranchLite {
  id: string;
  name: string;
}

interface TeamPanelProps {
  initialMembers: TeamMember[];
  branches: BranchLite[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TeamPanel({ initialMembers, branches }: TeamPanelProps) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  // ID of the member whose branch-picker popover is open. null = none.
  const [branchEditorFor, setBranchEditorFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("manager");
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | "both" | null>(null);

  async function copyText(value: string, which: "email" | "password" | "both") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(which);
      setTimeout(() => setCopiedField((c) => (c === which ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  function refresh() {
    // The action revalidatePath()s, but we're a client component — round-trip
    // via router.refresh() to pull the new server-rendered list.
    router.refresh();
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setIssued(null);
    startTransition(async () => {
      const res = await createTeamMemberWithPassword(email, inviteRole, fullName);
      if (res.ok) {
        // Surface the credentials modal — copy them out before dismissing,
        // they cannot be retrieved later.
        setIssued({ email: res.email, tempPassword: res.tempPassword });
        setEmail("");
        setFullName("");
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

  function handleToggleBranch(member: TeamMember, branchId: string) {
    const next = member.branch_ids.includes(branchId)
      ? member.branch_ids.filter((id) => id !== branchId)
      : [...member.branch_ids, branchId];
    // Optimistic
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, branch_ids: next } : m))
    );
    setFeedback(null);
    startTransition(async () => {
      const res = await updateTeamMemberBranches(member.id, next);
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error });
        // Revert
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id ? { ...m, branch_ids: member.branch_ids } : m
          )
        );
      } else {
        refresh();
      }
    });
  }

  function handleSetAllBranches(member: TeamMember, all: boolean) {
    const next = all ? branches.map((b) => b.id) : [];
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, branch_ids: next } : m))
    );
    setFeedback(null);
    startTransition(async () => {
      const res = await updateTeamMemberBranches(member.id, next);
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error });
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id ? { ...m, branch_ids: member.branch_ids } : m
          )
        );
      } else {
        refresh();
      }
    });
  }

  function branchLabelFor(m: TeamMember): string {
    if (m.role === "owner") return "All branches";
    if (m.branch_ids.length === 0) return "None — no access";
    if (m.branch_ids.length === branches.length) return "All branches";
    if (m.branch_ids.length === 1) {
      return branches.find((b) => b.id === m.branch_ids[0])?.name ?? "1 branch";
    }
    return `${m.branch_ids.length} branches`;
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
      {/* Add-user card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <KeyRound size={20} />
            </div>
            <div className="flex-1">
              <CardTitle>Add a team member</CardTitle>
              <CardDescription className="mt-1">
                Generates a temporary password for you to hand over. The user is
                forced to change it on first sign-in.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="sm:w-[180px]">
              <label className="text-xs font-medium text-base-600 block mb-1.5">
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                disabled={busy}
                className="w-full h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
              />
            </div>
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
              {busy ? <Loader2 className="animate-spin" size={14} /> : <KeyRound size={14} />}
              Create user
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

      {/* Credentials reveal — shown once after manual creation. The owner copies
          and hands it over. Once dismissed, the password cannot be recovered. */}
      {issued && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIssued(null);
          }}
        >
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-base-200">
            <div className="px-5 py-4 border-b border-base-200">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-accent" />
                <h3 className="text-base font-semibold text-base-900">User created</h3>
              </div>
              <p className="text-xs text-base-500 mt-1">
                Copy these details now — for security, the password cannot be retrieved
                once this dialog is closed. The user must change their password on
                first sign-in.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-base-500 block mb-1">
                  Email
                </label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 rounded bg-base-50 text-sm font-mono text-base-900 select-all">
                    {issued.email}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(issued.email, "email")}
                    className="px-3 rounded border border-base-200 bg-white text-xs text-base-600 hover:bg-base-50 inline-flex items-center gap-1"
                  >
                    {copiedField === "email" ? <Check size={13} /> : <Copy size={13} />}
                    {copiedField === "email" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-base-500 block mb-1">
                  Temporary password
                </label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-sm font-mono text-amber-900 select-all">
                    {issued.tempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(issued.tempPassword, "password")}
                    className="px-3 rounded border border-base-200 bg-white text-xs text-base-600 hover:bg-base-50 inline-flex items-center gap-1"
                  >
                    {copiedField === "password" ? <Check size={13} /> : <Copy size={13} />}
                    {copiedField === "password" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    `Email: ${issued.email}\nTemporary password: ${issued.tempPassword}\nSign in at: ${typeof window !== "undefined" ? window.location.origin : "https://app.shiftops.co.za"}/login`,
                    "both"
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-accent/30 bg-accent/5 text-xs font-medium text-accent hover:bg-accent/10 inline-flex items-center justify-center gap-1"
              >
                {copiedField === "both" ? <Check size={13} /> : <Copy size={13} />}
                {copiedField === "both" ? "Copied entire message" : "Copy both + sign-in link"}
              </button>
            </div>
            <div className="px-5 py-3 border-t border-base-200 flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

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
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">
                    Branch access
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
                    {/* Branch access — owners always see all, others get a popover picker */}
                    <td className="px-4 py-3">
                      {m.role === "owner" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-base-500">
                          <GitBranch size={12} />
                          All branches
                        </span>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setBranchEditorFor(branchEditorFor === m.id ? null : m.id)
                            }
                            disabled={busy}
                            className={`inline-flex items-center gap-1 px-2 h-8 rounded border text-xs font-medium transition ${
                              m.branch_ids.length === 0
                                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                : "border-base-200 bg-white text-base-700 hover:bg-base-50"
                            }`}
                          >
                            <GitBranch size={12} />
                            {branchLabelFor(m)}
                          </button>
                          {branchEditorFor === m.id && (
                            <>
                              {/* click-away overlay */}
                              <button
                                type="button"
                                aria-label="Close"
                                onClick={() => setBranchEditorFor(null)}
                                className="fixed inset-0 z-30 cursor-default bg-transparent"
                              />
                              <div className="absolute z-40 left-0 mt-1 w-64 bg-white rounded-lg border border-base-200 shadow-lg p-2">
                                <div className="flex items-center justify-between px-2 py-1 mb-1">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold text-base-500">
                                    Grant access to
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSetAllBranches(m, true)}
                                      className="text-[10px] text-accent hover:underline"
                                    >
                                      All
                                    </button>
                                    <span className="text-base-300">|</span>
                                    <button
                                      type="button"
                                      onClick={() => handleSetAllBranches(m, false)}
                                      className="text-[10px] text-base-500 hover:underline"
                                    >
                                      None
                                    </button>
                                  </div>
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-0.5">
                                  {branches.map((b) => (
                                    <label
                                      key={b.id}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-base-50 cursor-pointer text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={m.branch_ids.includes(b.id)}
                                        onChange={() => handleToggleBranch(m, b.id)}
                                        disabled={busy}
                                        className="rounded border-base-300"
                                      />
                                      <span className="text-base-700">{b.name}</span>
                                    </label>
                                  ))}
                                  {branches.length === 0 && (
                                    <p className="text-xs text-base-400 px-2 py-2">
                                      No branches yet — create one under Settings → Branches.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
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
