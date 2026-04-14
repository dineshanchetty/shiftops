"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface BrandRow {
  id: string;
  name: string;
  logo_url: string | null;
  color_hex: string | null;
}

export default function BrandsPage() {
  const supabase = createClient();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#EA580C");
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editLogo, setEditLogo] = useState<string | null>(null);

  // Feedback
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadBrands = useCallback(async () => {
    const { data: tid } = await supabase.rpc("get_user_tenant_id");
    if (!tid) return;
    setTenantId(tid);

    const { data } = await supabase
      .from("brands")
      .select("id, name, logo_url, color_hex")
      .eq("tenant_id", tid)
      .order("name");

    setBrands((data as BrandRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  function handleLogoFile(file: File, callback: (dataUrl: string) => void) {
    if (file.size > 200 * 1024) {
      setMessage({ type: "error", text: "Logo must be under 200KB." });
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setMessage({ type: "error", text: "Logo must be PNG, JPG, WebP, or SVG." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => callback(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleAdd() {
    if (!newName.trim() || !tenantId) return;
    setAdding(true);
    setMessage(null);

    const { error } = await supabase.from("brands").insert({
      tenant_id: tenantId,
      name: newName.trim(),
      color_hex: newColor || null,
      logo_url: newLogo,
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: `Brand "${newName.trim()}" added.` });
      setNewName("");
      setNewColor("#EA580C");
      setNewLogo(null);
      setShowAdd(false);
      await loadBrands();
    }
    setAdding(false);
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setMessage(null);

    const updateData: Record<string, unknown> = { name: editName.trim(), color_hex: editColor || null };
    if (editLogo !== undefined) updateData.logo_url = editLogo;
    const { error } = await supabase
      .from("brands")
      .update(updateData)
      .eq("id", id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Brand updated." });
      setEditId(null);
      await loadBrands();
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete brand "${name}"? Branches using this brand will need to be reassigned.`)) return;
    setMessage(null);

    const { error } = await supabase.from("brands").delete().eq("id", id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: `Brand "${name}" deleted.` });
      await loadBrands();
    }
  }

  return (
    <PageShell
      title="Brands"
      subtitle="Manage the brands in your franchise group."
      action={
        <div className="flex items-center gap-2">
          <Link href="/app/settings" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft size={14} /> Settings
          </Link>
        </div>
      }
    >
      {message && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
          message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Your Brands</h3>
          <Button size="sm" onClick={() => { setShowAdd(!showAdd); setMessage(null); }}>
            <Plus size={14} />
            Add Brand
          </Button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Input
                    label="Brand Name"
                    placeholder="e.g. Debonairs Pizza"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-200 cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand Logo</label>
                <div className="flex items-center gap-3">
                  {newLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={newLogo} alt="Logo preview" className="h-10 w-10 rounded object-contain border border-gray-200" />
                  )}
                  <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[var(--color-accent)] hover:bg-orange-50 transition-colors">
                    <Plus size={14} className="text-gray-400" />
                    <span className="text-gray-600">{newLogo ? "Change logo" : "Upload logo"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoFile(file, setNewLogo);
                      }}
                    />
                  </label>
                  <span className="text-xs text-gray-400">PNG, JPG, SVG — max 200KB</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
                  {adding ? "Adding..." : "Add Brand"}
                </Button>
                <Button variant="secondary" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Brand list */}
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">Loading brands...</div>
        ) : brands.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No brands yet. Add your first brand to get started.
          </div>
        ) : (
          <div>
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="flex items-center gap-4 px-6 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
              >
                {/* Brand logo or color dot */}
                {brand.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logo_url} alt={brand.name} className="w-8 h-8 rounded object-contain border border-gray-200 shrink-0" />
                ) : (
                  <div
                    className="w-8 h-8 rounded shrink-0 border border-gray-200 flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: brand.color_hex || "#E5E7EB" }}
                  >
                    {brand.name.charAt(0)}
                  </div>
                )}

                {editId === brand.id ? (
                  /* Edit mode */
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUpdate(brand.id)}
                      className="h-8 flex-1 min-w-[120px] rounded border border-gray-300 px-2 text-sm focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] outline-none"
                      autoFocus
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-8 w-10 rounded border border-gray-200 cursor-pointer"
                    />
                    <label className="flex items-center gap-1 px-2 py-1 text-xs border border-dashed border-gray-300 rounded cursor-pointer hover:border-[var(--color-accent)] transition-colors">
                      <Plus size={12} className="text-gray-400" />
                      Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoFile(file, setEditLogo);
                        }}
                      />
                    </label>
                    <button onClick={() => handleUpdate(brand.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <span className="text-sm font-medium text-gray-900 flex-1">{brand.name}</span>
                    <button
                      onClick={() => { setEditId(brand.id); setEditName(brand.name); setEditColor(brand.color_hex || "#E5E7EB"); setEditLogo(brand.logo_url); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(brand.id, brand.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
