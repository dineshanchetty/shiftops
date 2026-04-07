"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  User,
  Building2,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";

/* ---------- Types ---------- */

interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
}

interface TenantData {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
}

type FeedbackState = {
  type: "success" | "error";
  message: string;
} | null;

/* ---------- Feedback banner ---------- */

function Feedback({ state }: { state: FeedbackState }) {
  if (!state) return null;
  const isError = state.type === "error";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-green-200 bg-green-50 text-green-700"
      }`}
    >
      {isError ? <X size={16} className="shrink-0" /> : <Check size={16} className="shrink-0" />}
      {state.message}
    </div>
  );
}

/* ---------- Page ---------- */

export default function AccountSettingsPage() {
  const [loading, setLoading] = useState(true);

  // Profile
  const [profile, setProfile] = useState<ProfileData>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<FeedbackState>(null);

  // Tenant / company
  const [tenant, setTenant] = useState<TenantData>({
    id: "",
    name: "",
    slug: "",
    billingEmail: "",
  });
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyFeedback, setCompanyFeedback] = useState<FeedbackState>(null);

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackState>(null);

  /* ---------- Fetch data ---------- */

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // User profile
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      setProfile({
        fullName: (user.user_metadata?.full_name as string) ?? "",
        email: user.email ?? "",
        phone: (user.user_metadata?.phone as string) ?? user.phone ?? "",
      });
    }

    // Tenant
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (tenantId) {
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("id, name, slug, billing_email")
        .eq("id", tenantId)
        .single();

      if (tenantRow) {
        setTenant({
          id: tenantRow.id,
          name: tenantRow.name,
          slug: tenantRow.slug,
          billingEmail: tenantRow.billing_email ?? "",
        });
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- Save profile ---------- */

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileFeedback(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: profile.fullName,
        phone: profile.phone,
      },
    });

    if (error) {
      setProfileFeedback({ type: "error", message: error.message });
    } else {
      setProfileFeedback({ type: "success", message: "Profile updated." });
    }
    setSavingProfile(false);
  }

  /* ---------- Save company ---------- */

  async function handleSaveCompany() {
    setSavingCompany(true);
    setCompanyFeedback(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("tenants")
      .update({
        name: tenant.name,
        billing_email: tenant.billingEmail || null,
      })
      .eq("id", tenant.id);

    if (error) {
      setCompanyFeedback({ type: "error", message: error.message });
    } else {
      setCompanyFeedback({ type: "success", message: "Company details updated." });
    }
    setSavingCompany(false);
  }

  /* ---------- Change password ---------- */

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      setPasswordFeedback({
        type: "error",
        message: "Password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        type: "error",
        message: "Passwords do not match.",
      });
      return;
    }

    setSavingPassword(true);
    setPasswordFeedback(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordFeedback({ type: "error", message: error.message });
    } else {
      setPasswordFeedback({ type: "success", message: "Password updated." });
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    }
    setSavingPassword(false);
  }

  /* ---------- Loading state ---------- */

  if (loading) {
    return (
      <PageShell title="Account Settings">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  /* ---------- Render ---------- */

  return (
    <PageShell
      title="Account Settings"
      subtitle="Manage your profile, company, and security"
      action={
        <Link
          href="/app/settings"
          className="inline-flex items-center gap-1.5 text-sm text-base-500 hover:text-base-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Settings
        </Link>
      }
    >
      <div className="max-w-[640px] space-y-0">
        {/* ---- Profile Section ---- */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-base-900 font-display">
              Profile
            </h2>
          </div>

          <div className="space-y-4">
            <Input
              label="Full Name"
              value={profile.fullName}
              onChange={(e) =>
                setProfile((p) => ({ ...p, fullName: e.target.value }))
              }
              placeholder="Your full name"
            />
            <Input
              label="Email"
              value={profile.email}
              disabled
              className="cursor-not-allowed"
            />
            <Input
              label="Phone"
              value={profile.phone}
              onChange={(e) =>
                setProfile((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="+27 00 000 0000"
            />

            <Feedback state={profileFeedback} />

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={savingProfile}
                onClick={handleSaveProfile}
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </div>
        </section>

        {/* ---- Company / Tenant Section ---- */}
        <section className="border-t border-base-200 pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-base-900 font-display">
              Company
            </h2>
          </div>

          <div className="space-y-4">
            <Input
              label="Company Name"
              value={tenant.name}
              onChange={(e) =>
                setTenant((t) => ({ ...t, name: e.target.value }))
              }
              placeholder="Your company name"
            />
            <Input
              label="Slug"
              value={tenant.slug}
              disabled
              className="cursor-not-allowed"
            />
            <Input
              label="Billing Email"
              type="email"
              value={tenant.billingEmail}
              onChange={(e) =>
                setTenant((t) => ({ ...t, billingEmail: e.target.value }))
              }
              placeholder="billing@company.co.za"
            />

            <Feedback state={companyFeedback} />

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={savingCompany}
                onClick={handleSaveCompany}
              >
                {savingCompany ? "Saving..." : "Save Company"}
              </Button>
            </div>
          </div>
        </section>

        {/* ---- Security Section ---- */}
        <section className="border-t border-base-200 pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-base-900 font-display">
              Security
            </h2>
          </div>

          <div className="space-y-4">
            {/* Change Password */}
            {!showPasswordForm ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowPasswordForm(true);
                  setPasswordFeedback(null);
                }}
              >
                Change Password
              </Button>
            ) : (
              <div className="rounded-lg border border-base-200 p-4 space-y-4">
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />

                <Feedback state={passwordFeedback} />

                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordFeedback(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={savingPassword}
                    onClick={handleChangePassword}
                  >
                    {savingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </div>
            )}

            {/* Log Out All Devices */}
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled
                title="Coming soon"
              >
                Log Out All Devices
              </Button>
              <p className="text-xs text-base-400 mt-1.5">
                Coming soon — invalidate all existing sessions.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Danger Zone ---- */}
        <section className="border-t border-base-200 pt-6 mt-6 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-500" />
            <h2 className="text-base font-semibold text-red-600 font-display">
              Danger Zone
            </h2>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800 mb-1">
              Delete Account
            </p>
            <p className="text-sm text-red-600 mb-3">
              This will permanently delete your organisation, all branches, staff
              records, cashups, and data. This action cannot be undone.
            </p>
            <Button variant="danger" size="sm" disabled>
              Delete Account
            </Button>
            <p className="text-xs text-red-500 mt-2">
              To delete your account, please contact support at{" "}
              <a
                href="mailto:support@shiftops.co.za"
                className="underline hover:text-red-700"
              >
                support@shiftops.co.za
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
