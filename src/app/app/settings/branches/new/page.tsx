"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Plus } from "lucide-react";
import type { Brand } from "@/lib/types";

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function NewBranchPage() {
  const router = useRouter();
  const supabase = createClient();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [address, setAddress] = useState("");
  const [workingDays, setWorkingDays] = useState<string[]>([...ALL_DAYS]);
  const [openingTime, setOpeningTime] = useState("06:00");
  const [closingTime, setClosingTime] = useState("23:00");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form validation
  const [nameError, setNameError] = useState<string | undefined>();
  const [brandError, setBrandError] = useState<string | undefined>();

  useEffect(() => {
    async function loadBrands() {
      const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
      if (!tenantId) return;

      const { data } = await supabase
        .from("brands")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");

      const brandList = data ?? [];
      setBrands(brandList);
      if (brandList.length === 1) {
        setBrandId(brandList[0].id);
      }
      setLoadingBrands(false);
    }
    loadBrands();
  }, [supabase]);

  function validate(): boolean {
    let valid = true;

    if (!name.trim()) {
      setNameError("Branch name is required.");
      valid = false;
    } else {
      setNameError(undefined);
    }

    if (!brandId) {
      setBrandError("Please select a brand.");
      valid = false;
    } else {
      setBrandError(undefined);
    }

    return valid;
  }

  async function handleCreate() {
    if (!validate()) return;

    setSaving(true);
    setError(null);

    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) {
      setError("Unable to determine your tenant. Please try again.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("branches").insert({
      name: name.trim(),
      brand_id: brandId,
      address: address.trim() || null,
      tenant_id: tenantId,
      working_days: workingDays,
      opening_time: openingTime,
      closing_time: closingTime,
    });

    if (insertError) {
      setError("Failed to create branch: " + insertError.message);
      setSaving(false);
      return;
    }

    router.push("/app/settings/branches");
  }

  return (
    <PageShell
      title="Add Branch"
      subtitle="Create a new branch location"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/app/settings/branches")}
        >
          <ArrowLeft size={16} />
          Back
        </Button>
      }
    >
      <div className="space-y-6 max-w-lg">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* General Info */}
        <Card>
          <CardHeader>
            <CardTitle>Branch Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Branch Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(undefined);
              }}
              placeholder="e.g. Sandton City"
              error={nameError}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-base-700">
                Brand
              </label>
              {loadingBrands ? (
                <div className="h-10 rounded-lg border border-base-200 bg-surface px-3 flex items-center text-sm text-base-400">
                  Loading brands...
                </div>
              ) : (
                <select
                  value={brandId}
                  onChange={(e) => {
                    setBrandId(e.target.value);
                    if (brandError) setBrandError(undefined);
                  }}
                  className="h-10 w-full rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                >
                  <option value="">Select a brand</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              )}
              {brandError && (
                <p className="text-xs text-[var(--color-danger)]">
                  {brandError}
                </p>
              )}
            </div>

            <Input
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main Rd, Sandton"
            />
          </CardContent>
        </Card>

        {/* Operations */}
        <Card>
          <CardHeader>
            <CardTitle>Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Working Days */}
            <div>
              <label className="text-sm font-medium text-base-700 mb-2 block">
                Working Days
              </label>
              <div className="flex flex-wrap gap-3">
                {ALL_DAYS.map((day) => (
                  <label
                    key={day}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={workingDays.includes(day)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWorkingDays((prev) => [...prev, day]);
                        } else {
                          setWorkingDays((prev) =>
                            prev.filter((d) => d !== day)
                          );
                        }
                      }}
                      className="h-4 w-4 rounded border-base-300 text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-base-700">{day}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Operating Hours */}
            <div>
              <label className="text-sm font-medium text-base-700 mb-1 block">
                Opening Time
              </label>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                className="h-10 w-full rounded-lg border border-base-200 bg-surface px-3 text-sm font-mono text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-base-700 mb-1 block">
                Closing Time
              </label>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                className="h-10 w-full rounded-lg border border-base-200 bg-surface px-3 text-sm font-mono text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={saving}>
            <Plus size={16} />
            {saving ? "Creating..." : "Create Branch"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
