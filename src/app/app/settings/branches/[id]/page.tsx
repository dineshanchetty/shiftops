"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Save,
  Plug,
  RefreshCw,
  Download,
  AlertCircle,
  CheckCircle2,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { ShiftTemplatesTable } from "@/components/settings/shift-templates-table";
import type { Branch, AuraImport } from "@/lib/types";

type Tab = "general" | "operations" | "aura" | "shifts";

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function BranchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const branchId = params.id as string;
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("general");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [imports, setImports] = useState<AuraImport[]>([]);

  // Form state for general info
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  // Form state for operations
  const [workingDays, setWorkingDays] = useState<string[]>(ALL_DAYS);
  const [openingTime, setOpeningTime] = useState("06:00");
  const [closingTime, setClosingTime] = useState("23:00");

  // Form state for Aura SFTP
  const [sftpHost, setSftpHost] = useState("");
  const [sftpUser, setSftpUser] = useState("");
  const [sftpPass, setSftpPass] = useState("");
  const [exportPath, setExportPath] = useState("");

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadBranch = useCallback(async () => {
    const { data } = await supabase
      .from("branches")
      .select("*")
      .eq("id", branchId)
      .single();

    if (data) {
      setBranch(data);
      setName(data.name);
      setAddress(data.address ?? "");
      setWorkingDays(data.working_days ?? ALL_DAYS);
      setOpeningTime(data.opening_time ? data.opening_time.slice(0, 5) : "06:00");
      setClosingTime(data.closing_time ? data.closing_time.slice(0, 5) : "23:00");
      setSftpHost(data.aura_ftp_host ?? "");
      setSftpUser(data.aura_ftp_user ?? "");
      setSftpPass(""); // Never pre-fill password
      setExportPath(data.aura_export_path ?? "");
    }
    setLoading(false);
  }, [branchId, supabase]);

  const loadImports = useCallback(async () => {
    const { data } = await supabase
      .from("aura_imports")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(20);

    setImports(data ?? []);
  }, [branchId, supabase]);

  useEffect(() => {
    loadBranch();
    loadImports();
  }, [loadBranch, loadImports]);

  async function handleSaveGeneral() {
    setSaving(true);
    setSaveMessage(null);
    const { error } = await supabase
      .from("branches")
      .update({ name, address: address || null })
      .eq("id", branchId);

    setSaving(false);
    if (error) {
      setSaveMessage("Failed to save: " + error.message);
    } else {
      setSaveMessage("Branch details saved.");
    }
  }

  async function handleSaveOperations() {
    setSaving(true);
    setSaveMessage(null);
    const { error } = await supabase
      .from("branches")
      .update({
        working_days: workingDays,
        opening_time: openingTime,
        closing_time: closingTime,
      })
      .eq("id", branchId);

    setSaving(false);
    if (error) {
      setSaveMessage("Failed to save: " + error.message);
    } else {
      setSaveMessage("Operations settings saved.");
      await loadBranch();
    }
  }

  async function handleSaveSftp() {
    setSaving(true);
    setSaveMessage(null);

    const updates: Record<string, string | null> = {
      aura_ftp_host: sftpHost || null,
      aura_ftp_user: sftpUser || null,
      aura_export_path: exportPath || null,
    };

    // Only update password if user entered a new one
    if (sftpPass) {
      updates.aura_ftp_pass_encrypted = sftpPass; // In prod, encrypt before storing
    }

    const { error } = await supabase
      .from("branches")
      .update(updates)
      .eq("id", branchId);

    setSaving(false);
    if (error) {
      setSaveMessage("Failed to save: " + error.message);
    } else {
      setSaveMessage("SFTP settings saved.");
      await loadBranch();
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionResult(null);

    try {
      const res = await fetch("/api/aura/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const data = await res.json();
      setConnectionResult(data);
    } catch {
      setConnectionResult({
        success: false,
        message: "Network error testing connection.",
      });
    }

    setTestingConnection(false);
  }

  if (loading) {
    return (
      <PageShell title="Branch Details" subtitle="Loading...">
        <div className="text-sm text-base-400">Loading branch data...</div>
      </PageShell>
    );
  }

  if (!branch) {
    return (
      <PageShell title="Branch Not Found">
        <p className="text-sm text-base-500">
          This branch could not be found.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={branch.name}
      subtitle="Branch settings and Aura POS integration"
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
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-base-200">
        {(
          [
            { key: "general", label: "General" },
            { key: "operations", label: "Operations" },
            { key: "shifts", label: "Shift Templates" },
            { key: "aura", label: "Aura Integration" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-base-500 hover:text-base-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Save message */}
      {saveMessage && (
        <div className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-base-700">
          {saveMessage}
        </div>
      )}

      {tab === "general" && (
        <Card>
          <CardHeader>
            <CardTitle>Branch Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <Input
              label="Branch Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sandton City"
            />
            <Input
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main Rd, Sandton"
            />
            <Button
              onClick={handleSaveGeneral}
              disabled={saving}
              className="mt-2"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Details"}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "operations" && (
        <div className="space-y-6">
          {/* Working Days */}
          <Card>
            <CardHeader>
              <CardTitle>Working Days</CardTitle>
            </CardHeader>
            <CardContent className="max-w-lg">
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
            </CardContent>
          </Card>

          {/* Operating Hours */}
          <Card>
            <CardHeader>
              <CardTitle>Operating Hours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
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
              <Button
                onClick={handleSaveOperations}
                disabled={saving}
                className="mt-2"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Operations"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "shifts" && (
        <ShiftTemplatesTable branchId={branchId} tenantId={branch.tenant_id} />
      )}

      {tab === "aura" && (
        <div className="space-y-6">
          {/* Email Ingest — unique per-branch address */}
          {(branch as unknown as { email_code?: string })?.email_code && (
            <Card className="border-purple-200 bg-purple-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail size={18} className="text-purple-600" />
                  Email Ingest
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-w-2xl">
                <p className="text-sm text-base-600">
                  Forward your daily Aura CSV exports to this address — they&apos;ll be auto-imported.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg border border-purple-200 bg-white font-mono text-sm text-purple-700 select-all">
                    aura+{(branch as unknown as { email_code: string }).email_code}@aura.shiftops.co.za
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const addr = `aura+${(branch as unknown as { email_code: string }).email_code}@aura.shiftops.co.za`;
                      navigator.clipboard.writeText(addr);
                      setEmailCopied(true);
                      setTimeout(() => setEmailCopied(false), 1500);
                    }}
                  >
                    {emailCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                  </Button>
                </div>
                <div className="text-xs text-purple-600 bg-purple-100/50 rounded-lg px-3 py-2">
                  <strong>Tip:</strong> CSV attachments are auto-matched to this branch using the unique code (<code className="font-mono">{(branch as unknown as { email_code: string }).email_code}</code>) in the address. Field mappings from your last manual upload will be used.
                </div>
              </CardContent>
            </Card>
          )}

          {/* SFTP Settings */}
          <Card>
            <CardHeader>
              <CardTitle>SFTP Connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <Input
                label="SFTP Host"
                value={sftpHost}
                onChange={(e) => setSftpHost(e.target.value)}
                placeholder="e.g. ftp.cosoft.co.za"
              />
              <Input
                label="Username"
                value={sftpUser}
                onChange={(e) => setSftpUser(e.target.value)}
                placeholder="e.g. storename_aura"
              />
              <Input
                label="Password"
                type="password"
                value={sftpPass}
                onChange={(e) => setSftpPass(e.target.value)}
                placeholder={
                  branch.aura_ftp_pass_encrypted
                    ? "********** (leave blank to keep current)"
                    : "Enter password"
                }
              />
              <Input
                label="Export Path"
                value={exportPath}
                onChange={(e) => setExportPath(e.target.value)}
                placeholder="e.g. /exports/daily/"
              />

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSaveSftp} disabled={saving}>
                  <Save size={16} />
                  {saving ? "Saving..." : "Save SFTP Settings"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                >
                  <Plug size={16} />
                  {testingConnection ? "Testing..." : "Test Connection"}
                </Button>
              </div>

              {connectionResult && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-4 py-3 text-sm",
                    connectionResult.success
                      ? "bg-[var(--color-success-soft)] text-green-700"
                      : "bg-[var(--color-danger-soft)] text-red-700"
                  )}
                >
                  {connectionResult.success ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  )}
                  {connectionResult.message}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Import Trigger */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Import Actions</CardTitle>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    router.push(`/app/aura-upload?branch=${branchId}`)
                  }
                >
                  <Download size={16} />
                  Upload CSV Manually
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-base-500">
                Use the manual CSV upload to import cashup data when SFTP is not
                configured or if you need to backfill data.
              </p>
            </CardContent>
          </Card>

          {/* Import History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Import History</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadImports}
                >
                  <RefreshCw size={14} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {imports.length === 0 ? (
                <p className="text-sm text-base-400 py-4">
                  No imports yet for this branch.
                </p>
              ) : (
                <div className="rounded-lg border border-base-200 overflow-hidden">
                  <div className="grid grid-cols-[100px_1fr_100px_1fr] gap-4 px-4 py-2 bg-surface-2 text-xs font-medium text-base-400 uppercase tracking-wide">
                    <span>Date</span>
                    <span>File</span>
                    <span>Status</span>
                    <span>Error</span>
                  </div>
                  {imports.map((imp) => (
                    <div
                      key={imp.id}
                      className="grid grid-cols-[100px_1fr_100px_1fr] gap-4 px-4 py-3 border-t border-base-100 text-sm"
                    >
                      <span className="text-base-700">
                        {imp.import_date
                          ? formatDate(imp.import_date)
                          : "—"}
                      </span>
                      <span className="text-base-600 truncate">
                        {imp.source_file ?? "—"}
                      </span>
                      <span>
                        <ImportStatusBadge status={imp.status} />
                      </span>
                      <span className="text-xs text-base-400 truncate">
                        {imp.error_log ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function ImportStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "processing":
      return <Badge variant="info">Processing</Badge>;
    case "failed":
      return <Badge variant="danger">Failed</Badge>;
    default:
      return <Badge variant="default">{status ?? "Unknown"}</Badge>;
  }
}
