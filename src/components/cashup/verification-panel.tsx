"use client";

/**
 * Verification Panel
 *
 * Lets managers cross-check each cashup summary figure against supporting
 * document evidence (from email imports + manual uploads), override values,
 * and confirm the cashup as verified.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  Edit2,
  Check,
  X as XIcon,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Summary fields we verify
const SUMMARY_FIELDS = [
  { key: "gross_turnover", label: "Gross Turnover", validates: "gross_turnover" },
  { key: "discounts", label: "Discounts", validates: "discounts" },
  { key: "delivery_charges", label: "Delivery Charges", validates: null },
  { key: "credit_cards", label: "Credit Cards", validates: "credit_cards" },
  { key: "cash_banked", label: "Cash Banked", validates: "cash_banked" },
  { key: "debtors", label: "Debtors", validates: null },
] as const;

type FieldKey = typeof SUMMARY_FIELDS[number]["key"];

interface DocEvidence {
  id: string;
  file_name: string;
  doc_type: string;
  verification_status: "pending" | "verified" | "mismatch";
  variance_amount: number | null;
  extracted_total: number | null;
  validates_field: string | null;
  report_type: string | null;
}

interface FieldConfirmation {
  confirmed: boolean;
  at?: string;
  by?: string;
  note?: string;
}

interface VerificationPanelProps {
  cashupId: string | null;
  tenantId: string;
  readOnly?: boolean;
  initialCashup: Record<FieldKey, number | null>;
  onFieldUpdate: (field: FieldKey, value: number | null) => void;
}

export function VerificationPanel({
  cashupId,
  tenantId,
  readOnly = false,
  initialCashup,
  onFieldUpdate,
}: VerificationPanelProps) {
  const supabase = createClient();

  const [docs, setDocs] = useState<DocEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldConfirmations, setFieldConfirmations] = useState<Record<string, FieldConfirmation>>({});
  const [cashupConfirmedAt, setCashupConfirmedAt] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingField, setSavingField] = useState<FieldKey | null>(null);

  const loadDocs = useCallback(async () => {
    if (!cashupId || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [docsRes, cashupRes] = await Promise.all([
      (supabase as any)
        .from("cashup_documents")
        .select("id, file_name, doc_type, verification_status, variance_amount, parsed_data")
        .eq("cashup_id", cashupId)
        .eq("tenant_id", tenantId)
        .order("created_at"),
      (supabase as any)
        .from("daily_cashups")
        .select("field_confirmations, confirmed_at")
        .eq("id", cashupId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

    const evidence: DocEvidence[] = (docsRes.data ?? []).map((d: Record<string, unknown>) => {
      const parsed = d.parsed_data as Record<string, unknown> | null;
      return {
        id: d.id as string,
        file_name: d.file_name as string,
        doc_type: d.doc_type as string,
        verification_status: d.verification_status as "pending" | "verified" | "mismatch",
        variance_amount: d.variance_amount as number | null,
        extracted_total: (parsed?.extracted_total as number | null) ?? null,
        validates_field: (parsed?.validates_field as string | null) ?? null,
        report_type: (parsed?.report_type as string | null) ?? null,
      };
    });

    setDocs(evidence);
    setFieldConfirmations((cashupRes.data?.field_confirmations as Record<string, FieldConfirmation>) ?? {});
    setCashupConfirmedAt(cashupRes.data?.confirmed_at ?? null);
    setLoading(false);
  }, [cashupId, tenantId, supabase]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  async function handleViewDoc(docId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("cashup_documents")
      .select("file_data, file_name")
      .eq("id", docId)
      .eq("tenant_id", tenantId)
      .single();
    if (!data?.file_data) return;

    const raw: string = data.file_data;
    let base64 = raw;
    let mimeType = "application/pdf";
    const m = raw.match(/^data:([^;]+);base64,(.*)$/);
    if (m) { mimeType = m[1]; base64 = m[2]; }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }

  async function handleOverrideField(field: FieldKey) {
    if (!cashupId) return;
    const num = editValue === "" ? null : parseFloat(editValue);
    if (editValue !== "" && isNaN(num as number)) return;

    setSavingField(field);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("daily_cashups")
      .update({ [field]: num })
      .eq("id", cashupId)
      .eq("tenant_id", tenantId);

    if (!error) {
      onFieldUpdate(field, num);
      setEditingField(null);
    }
    setSavingField(null);
  }

  async function handleConfirmField(field: FieldKey, confirmed: boolean, note?: string) {
    if (!cashupId) return;
    const { data: { user } } = await supabase.auth.getUser();

    const updated = {
      ...fieldConfirmations,
      [field]: {
        confirmed,
        at: new Date().toISOString(),
        by: user?.id,
        note,
      },
    };
    setFieldConfirmations(updated);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("daily_cashups")
      .update({ field_confirmations: updated })
      .eq("id", cashupId)
      .eq("tenant_id", tenantId);
  }

  async function handleConfirmCashup() {
    if (!cashupId) return;
    const { data: { user } } = await supabase.auth.getUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("daily_cashups")
      .update({
        confirmed_at: new Date().toISOString(),
        confirmed_by: user?.id,
        status: "verified",
      })
      .eq("id", cashupId)
      .eq("tenant_id", tenantId);

    if (!error) setCashupConfirmedAt(new Date().toISOString());
  }

  if (!cashupId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <AlertTriangle size={18} className="inline mr-2" />
        Save the cashup first to enable verification.
      </div>
    );
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading verification...</div>;
  }

  // Count statuses
  const relevantDocs = docs.filter((d) => d.validates_field);
  const verifiedDocs = relevantDocs.filter((d) => d.verification_status === "verified").length;
  const mismatchDocs = relevantDocs.filter((d) => d.verification_status === "mismatch").length;
  const pendingDocs = relevantDocs.filter((d) => d.verification_status === "pending").length;
  const confirmedFieldsCount = Object.values(fieldConfirmations).filter((c) => c.confirmed).length;
  const totalFieldsToConfirm = SUMMARY_FIELDS.length;
  const allConfirmed = confirmedFieldsCount === totalFieldsToConfirm;

  return (
    <div className="space-y-4">
      {/* Status summary */}
      <div className={cn(
        "rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3",
        cashupConfirmedAt ? "border-green-300 bg-green-50" :
        mismatchDocs > 0 ? "border-red-200 bg-red-50" :
        allConfirmed ? "border-blue-200 bg-blue-50" :
        "border-gray-200 bg-gray-50"
      )}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className={cn(
            cashupConfirmedAt ? "text-green-600" : mismatchDocs > 0 ? "text-red-500" : "text-gray-400"
          )} />
          <div>
            <div className="font-semibold text-sm text-base-900">
              {cashupConfirmedAt ? "Cashup Verified" : `${confirmedFieldsCount} of ${totalFieldsToConfirm} fields confirmed`}
            </div>
            <div className="text-xs text-base-500 mt-0.5">
              Docs: {verifiedDocs} verified · {mismatchDocs} mismatch · {pendingDocs} pending
            </div>
          </div>
        </div>
        {!cashupConfirmedAt && allConfirmed && !readOnly && (
          <Button onClick={handleConfirmCashup} size="sm">
            <ShieldCheck size={14} />
            Confirm Cashup
          </Button>
        )}
        {cashupConfirmedAt && (
          <span className="text-xs text-green-700 font-medium">
            Confirmed {new Date(cashupConfirmedAt).toLocaleString("en-ZA")}
          </span>
        )}
      </div>

      {/* Per-field verification */}
      <div className="space-y-2">
        {SUMMARY_FIELDS.map((field) => {
          const cashupValue = initialCashup[field.key];
          const evidence = docs.filter((d) => d.validates_field === field.validates);
          const confirmation = fieldConfirmations[field.key];
          const isConfirmed = confirmation?.confirmed === true;
          const hasMismatch = evidence.some((d) => d.verification_status === "mismatch");
          const isEditing = editingField === field.key;

          return (
            <div
              key={field.key}
              className={cn(
                "rounded-xl border p-4",
                isConfirmed ? "border-green-200 bg-green-50/40" :
                hasMismatch ? "border-red-200 bg-red-50/30" :
                "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-base-500">
                      {field.label}
                    </span>
                    {isConfirmed && <CheckCircle2 size={14} className="text-green-600" />}
                    {hasMismatch && <AlertTriangle size={14} className="text-red-500" />}
                  </div>

                  {/* Cashup value (editable) */}
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-9 w-32 rounded-lg border border-base-200 bg-white px-2 text-sm font-mono"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => handleOverrideField(field.key)}
                        disabled={savingField === field.key}
                      >
                        <Check size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingField(null)}
                      >
                        <XIcon size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-mono font-bold text-base-900">
                        R{cashupValue != null ? cashupValue.toFixed(2) : "—"}
                      </span>
                      {!readOnly && !isConfirmed && (
                        <button
                          onClick={() => {
                            setEditingField(field.key);
                            setEditValue(cashupValue != null ? String(cashupValue) : "");
                          }}
                          className="text-gray-300 hover:text-accent transition-colors p-1"
                          title="Override value"
                        >
                          <Edit2 size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Evidence from documents */}
                  {evidence.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {evidence.map((doc) => {
                        const match = doc.verification_status === "verified";
                        const variance = doc.variance_amount;
                        return (
                          <div
                            key={doc.id}
                            className={cn(
                              "flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md",
                              match ? "bg-green-100/70 text-green-800" :
                              doc.verification_status === "mismatch" ? "bg-red-100/70 text-red-800" :
                              "bg-gray-100 text-gray-600"
                            )}
                          >
                            <FileText size={11} className="shrink-0" />
                            <span className="flex-1 truncate">{doc.file_name}</span>
                            {doc.extracted_total !== null && (
                              <span className="font-mono font-semibold">
                                R{doc.extracted_total.toFixed(2)}
                              </span>
                            )}
                            {variance !== null && variance !== 0 && (
                              <span className="font-mono font-semibold text-red-600">
                                (Δ R{Math.abs(variance).toFixed(2)})
                              </span>
                            )}
                            <button
                              onClick={() => handleViewDoc(doc.id)}
                              className="hover:text-accent transition-colors"
                              title="View"
                            >
                              <Eye size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {evidence.length === 0 && (
                    <div className="mt-2 text-xs text-gray-400 italic">
                      No supporting document evidence
                    </div>
                  )}
                </div>

                {/* Confirm checkbox */}
                {!readOnly && !cashupConfirmedAt && (
                  <div className="shrink-0 pt-1">
                    <button
                      onClick={() => handleConfirmField(field.key, !isConfirmed)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        isConfirmed
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {isConfirmed ? (
                        <><Check size={12} /> Confirmed</>
                      ) : (
                        <><Clock size={12} /> Confirm</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Supporting docs (no validation) */}
      {docs.filter((d) => !d.validates_field).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-500 mb-2">
            Other Supporting Documents
          </div>
          <div className="space-y-1.5">
            {docs.filter((d) => !d.validates_field).map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md bg-white border border-gray-100">
                <FileText size={11} className="text-gray-400 shrink-0" />
                <span className="flex-1 truncate">{doc.file_name}</span>
                <span className="text-gray-400">{doc.report_type ?? doc.doc_type}</span>
                {doc.extracted_total !== null && (
                  <span className="font-mono font-semibold text-gray-600">
                    R{doc.extracted_total.toFixed(2)}
                  </span>
                )}
                <button
                  onClick={() => handleViewDoc(doc.id)}
                  className="text-gray-400 hover:text-accent transition-colors"
                  title="View"
                >
                  <Eye size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
