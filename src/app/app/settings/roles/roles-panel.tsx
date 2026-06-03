"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRole,
  updateRole,
  deleteRole,
  type RoleWithPermissions,
  type PermissionCatalog,
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
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Shield,
  Check,
  X,
} from "lucide-react";

interface RolesPanelProps {
  initialRoles: RoleWithPermissions[];
  permissions: PermissionCatalog[];
}

const CATEGORY_LABELS: Record<string, string> = {
  cashup: "Cashup",
  roster: "Roster",
  staff: "Staff",
  reports: "Reports",
  settings: "Settings",
  team: "Team",
  system: "System",
};

/** Group permissions by category for display in the editor. */
function groupByCategory(perms: PermissionCatalog[]): Record<string, PermissionCatalog[]> {
  const groups: Record<string, PermissionCatalog[]> = {};
  for (const p of perms) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}

export function RolesPanel({ initialRoles, permissions }: RolesPanelProps) {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleWithPermissions[]>(initialRoles);
  const [editing, setEditing] = useState<RoleWithPermissions | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const groups = useMemo(() => groupByCategory(permissions), [permissions]);

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setEditing({
      id: "",
      name: "",
      description: "",
      is_system: false,
      permissions: [],
      member_count: 0,
    });
    setCreating(true);
  }

  function openEdit(r: RoleWithPermissions) {
    setEditing({ ...r });
    setCreating(false);
  }

  function closeEditor() {
    setEditing(null);
    setCreating(false);
  }

  function handleDelete(r: RoleWithPermissions) {
    if (r.is_system) return;
    if (!confirm(`Delete role "${r.name}"? Members with this role will need to be reassigned.`)) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteRole(r.id);
      if (res.ok) {
        setRoles((prev) => prev.filter((x) => x.id !== r.id));
        setFeedback({ type: "ok", text: `Deleted ${r.name}.` });
        refresh();
      } else {
        setFeedback({ type: "err", text: res.error });
      }
    });
  }

  function handleSave() {
    if (!editing) return;
    setFeedback(null);

    startTransition(async () => {
      if (creating) {
        const res = await createRole(editing.name, editing.description ?? "", editing.permissions);
        if (res.ok) {
          setFeedback({ type: "ok", text: `Created ${editing.name}.` });
          closeEditor();
          refresh();
        } else {
          setFeedback({ type: "err", text: res.error });
        }
      } else {
        const res = await updateRole(
          editing.id,
          editing.name,
          editing.description ?? "",
          editing.permissions
        );
        if (res.ok) {
          setRoles((prev) =>
            prev.map((r) =>
              r.id === editing.id
                ? { ...r, name: editing.name, description: editing.description, permissions: editing.permissions }
                : r
            )
          );
          setFeedback({ type: "ok", text: `Saved ${editing.name}.` });
          closeEditor();
          refresh();
        } else {
          setFeedback({ type: "err", text: res.error });
        }
      }
    });
  }

  function toggle(key: string) {
    if (!editing) return;
    const has = editing.permissions.includes(key);
    setEditing({
      ...editing,
      permissions: has ? editing.permissions.filter((k) => k !== key) : [...editing.permissions, key],
    });
  }

  function setAllInCategory(category: string, on: boolean) {
    if (!editing) return;
    const keysInCat = (groups[category] ?? []).map((p) => p.key);
    const next = on
      ? Array.from(new Set([...editing.permissions, ...keysInCat]))
      : editing.permissions.filter((k) => !keysInCat.includes(k));
    setEditing({ ...editing, permissions: next });
  }

  // For the Admin row we don't let permissions be edited.
  const isAdminEditing = editing?.is_system && editing.name === "Admin";

  return (
    <div className="space-y-6">
      {/* Roles list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Roles</CardTitle>
              <CardDescription className="mt-1">
                Built-in roles (Admin, Manager) can&apos;t be deleted. Admin always has every
                permission. Add your own roles for tighter access (e.g. &quot;Cashier&quot; — only
                cashup edit, no settings).
              </CardDescription>
            </div>
            <Button onClick={openCreate} disabled={busy}>
              <Plus size={14} /> New role
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-200 bg-surface-2">
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">Role</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">Description</th>
                <th className="px-4 py-2.5 text-center text-xs uppercase tracking-wide font-semibold text-base-400">Permissions</th>
                <th className="px-4 py-2.5 text-center text-xs uppercase tracking-wide font-semibold text-base-400">Members</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b border-base-200 last:border-b-0 hover:bg-surface-2/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.is_system ? (
                        <ShieldCheck size={14} className="text-accent" />
                      ) : (
                        <Shield size={14} className="text-base-500" />
                      )}
                      <span className="font-medium text-base-900">{r.name}</span>
                      {r.is_system && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          Built-in
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-base-600">{r.description ?? "—"}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs text-base-600">
                    {r.is_system && r.name === "Admin" ? (
                      <span className="text-accent font-semibold">all ({permissions.length})</span>
                    ) : (
                      <span>{r.permissions.length} / {permissions.length}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-base-600">{r.member_count}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      onClick={() => openEdit(r)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-xs text-base-700 hover:text-accent hover:underline disabled:opacity-50"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    {!r.is_system && (
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 ml-2"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {feedback && (
            <div
              className={`mx-4 my-3 rounded-md border px-3 py-2 text-xs ${
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

      {/* Editor modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor();
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-xl shadow-xl border border-base-200 flex flex-col">
            <div className="px-5 py-4 border-b border-base-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-base-900">
                  {creating ? "New role" : `Edit "${editing.name}"`}
                </h3>
                {isAdminEditing && (
                  <p className="text-xs text-amber-700 mt-1">
                    Admin always has every permission — can&apos;t be modified.
                  </p>
                )}
              </div>
              <button
                onClick={closeEditor}
                className="text-base-400 hover:text-base-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-base-600 block mb-1.5">Name</label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    disabled={editing.is_system || busy}
                    placeholder="e.g. Branch Supervisor"
                    className="w-full h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent disabled:bg-base-50 disabled:text-base-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-base-600 block mb-1.5">Description</label>
                  <input
                    type="text"
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    disabled={busy}
                    placeholder="Optional"
                    className="w-full h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-base-600 block mb-2">Permissions</label>
                <div className="space-y-3">
                  {Object.entries(groups).map(([category, catPerms]) => {
                    const granted = catPerms.filter((p) => editing.permissions.includes(p.key)).length;
                    const allOn = granted === catPerms.length;
                    return (
                      <div key={category} className="rounded-lg border border-base-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-wider font-bold text-base-500">
                              {CATEGORY_LABELS[category] ?? category}
                            </span>
                            <span className="text-[10px] text-base-400">
                              {granted}/{catPerms.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAllInCategory(category, !allOn)}
                            disabled={isAdminEditing || busy}
                            className="text-[11px] text-accent hover:underline disabled:opacity-50"
                          >
                            {allOn ? "Clear all" : "Select all"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {catPerms.map((p) => {
                            const on = editing.permissions.includes(p.key);
                            return (
                              <label
                                key={p.key}
                                className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition ${
                                  isAdminEditing
                                    ? "opacity-60 cursor-not-allowed"
                                    : "hover:bg-base-50"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAdminEditing ? true : on}
                                  onChange={() => !isAdminEditing && toggle(p.key)}
                                  disabled={isAdminEditing || busy}
                                  className="rounded border-base-300 mt-0.5"
                                />
                                <div className="flex-1 leading-tight">
                                  <div className="text-base-800 text-xs">{p.description}</div>
                                  <code className="text-[9px] text-base-400 font-mono">{p.key}</code>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-base-200 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={closeEditor} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={busy || isAdminEditing || !editing.name.trim()}>
                {busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                {creating ? "Create role" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
