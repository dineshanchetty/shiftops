"use client";

/**
 * Forced password-change screen for users created via the manual
 * "Generate password" flow on the Team page. The app layout redirects
 * here whenever auth user metadata has `must_change_password = true`.
 *
 * On successful change we clear the flag and bounce to the dashboard.
 *
 * Accessible to every signed-in role (owners and managers alike) —
 * unlike Settings → Account which is owner-only.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2 } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? "");
        setMustChange(
          (data.user.user_metadata as { must_change_password?: boolean })?.must_change_password === true
        );
      }
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
      // Clear the must_change_password flag so the layout stops redirecting here.
      data: { must_change_password: false },
    });
    setSaving(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    // Bounce to dashboard. Use replace so they can't navigate back to this page.
    router.replace("/app");
    router.refresh();
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl border border-base-200 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <KeyRound size={18} />
        </div>
        <div>
          <h1 className="text-base font-semibold text-base-900">
            {mustChange ? "Set a new password" : "Change password"}
          </h1>
          <p className="text-xs text-base-500">
            Signed in as <span className="font-mono">{userEmail}</span>
          </p>
        </div>
      </div>

      {mustChange && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Your account was created with a temporary password. Choose a new one
          to continue — you&apos;ll be returned to the dashboard.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" disabled={saving || !newPassword} className="w-full">
          {saving ? <Loader2 className="animate-spin" size={14} /> : <KeyRound size={14} />}
          {saving ? "Updating..." : "Set new password"}
        </Button>
      </form>
    </div>
  );
}
