"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSupplier,
  renameSupplier,
  setSupplierActive,
} from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Loader2, Plus, Pencil, Check, X, Truck } from "lucide-react";

export interface SupplierRow {
  id: string;
  name: string;
  active: boolean;
}

export function SuppliersPanel({ initial }: { initial: SupplierRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<SupplierRow[]>(initial);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, start] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function refresh() {
    router.refresh();
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    start(async () => {
      const res = await createSupplier(newName);
      if (res.ok) {
        setNewName("");
        refresh();
      } else {
        setFeedback({ type: "err", text: res.error });
      }
    });
  }

  function handleRename(id: string) {
    setFeedback(null);
    start(async () => {
      const res = await renameSupplier(id, editName);
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name: editName.trim() } : r)));
        setEditingId(null);
        refresh();
      } else {
        setFeedback({ type: "err", text: res.error });
      }
    });
  }

  function handleToggle(row: SupplierRow) {
    setFeedback(null);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
    start(async () => {
      const res = await setSupplierActive(row.id, !row.active);
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error });
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: row.active } : r)));
      } else {
        refresh();
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Truck size={20} />
            </div>
            <div>
              <CardTitle>Add a supplier</CardTitle>
              <CardDescription className="mt-1">
                These appear in the Purchases dropdown on the cashup form.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Bidvest, ABI, Local Butcher"
              disabled={busy}
              className="flex-1 h-10 px-3 rounded-lg border border-base-200 bg-white text-sm text-base-900 outline-none focus:border-accent"
            />
            <Button type="submit" disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Add
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

      <Card>
        <CardHeader>
          <CardTitle>Suppliers ({rows.length})</CardTitle>
          <CardDescription className="mt-1">
            Deactivate a supplier to hide it from the dropdown without losing
            historic purchase records.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-200 bg-surface-2">
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">Name</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide font-semibold text-base-400">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-base-400">
                    No suppliers yet — add your first above.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-base-200 last:border-b-0">
                  <td className="px-4 py-3">
                    {editingId === r.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 px-2 rounded border border-base-200 bg-white text-sm w-full max-w-xs outline-none focus:border-accent"
                        autoFocus
                      />
                    ) : (
                      <span className={r.active ? "text-base-900 font-medium" : "text-base-400 line-through"}>
                        {r.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.active ? "bg-green-100 text-green-700" : "bg-base-200 text-base-500"
                      }`}
                    >
                      {r.active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {editingId === r.id ? (
                      <>
                        <button
                          onClick={() => handleRename(r.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"
                        >
                          <Check size={12} /> Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center gap-1 text-xs text-base-500 hover:underline"
                        >
                          <X size={12} /> Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditName(r.name);
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs text-base-700 hover:text-accent hover:underline"
                        >
                          <Pencil size={12} /> Rename
                        </button>
                        <button
                          onClick={() => handleToggle(r)}
                          disabled={busy}
                          className="text-xs text-base-600 hover:underline"
                        >
                          {r.active ? "Hide" : "Activate"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
