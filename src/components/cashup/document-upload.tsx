"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType =
  | "cc_batch"
  | "banking_slip"
  | "cashup_summary"
  | "stock_report"
  | "other";

type VerificationStatus = "pending" | "verified" | "mismatch";

interface DocumentRecord {
  id: string;
  cashup_id: string | null;
  tenant_id: string | null;
  doc_type: DocType;
  file_name: string;
  file_size: number | null;
  verification_status: VerificationStatus;
  variance_amount: number | null;
  notes: string | null;
  // entered total for comparison
  entered_total: number | null;
}

interface DocumentUploadProps {
  cashupId: string | null;
  creditCards: number | null;
  cashBanked: number | null;
  tenantId: string;
  readOnly?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<DocType, string> = {
  cc_batch: "CC Batch Report",
  banking_slip: "Banking Slip",
  cashup_summary: "Cashup Summary",
  stock_report: "Stock Report",
  other: "Other",
};

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const COIN_TOLERANCE = 5; // R5 tolerance for coin differences

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function computeVerification(
  docType: DocType,
  enteredTotal: number | null,
  creditCards: number | null,
  cashBanked: number | null
): { status: VerificationStatus; variance: number | null } {
  if (enteredTotal === null) return { status: "pending", variance: null };

  if (docType === "cc_batch" && creditCards !== null) {
    const diff = Math.abs(enteredTotal - creditCards);
    return {
      status: diff <= COIN_TOLERANCE ? "verified" : "mismatch",
      variance: diff <= COIN_TOLERANCE ? 0 : enteredTotal - creditCards,
    };
  }

  if (docType === "banking_slip" && cashBanked !== null) {
    const diff = Math.abs(enteredTotal - cashBanked);
    return {
      status: diff <= COIN_TOLERANCE ? "verified" : "mismatch",
      variance: diff <= COIN_TOLERANCE ? 0 : enteredTotal - cashBanked,
    };
  }

  return { status: "pending", variance: null };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 size={11} />
        Verified
      </span>
    );
  }
  if (status === "mismatch") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle size={11} />
        Mismatch
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <Clock size={11} />
      Pending
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentUpload({
  cashupId,
  creditCards,
  cashBanked,
  tenantId,
  readOnly = false,
}: DocumentUploadProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New upload form state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDocType, setPendingDocType] = useState<DocType>("other");
  const [pendingEnteredTotal, setPendingEnteredTotal] = useState<string>("");
  const [pendingNotes, setPendingNotes] = useState<string>("");
  const [aiParsing, setAiParsing] = useState(false);
  const [aiResult, setAiResult] = useState<{ amount: number | null; confidence: string; rawText: string } | null>(null);

  const selectClass = cn(
    "h-9 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
    "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
    "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
  );

  const handleFileSelect = useCallback((file: File) => {
    setUploadError(null);
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setUploadError("Only PDF, JPG, and PNG files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File must be under 2 MB.");
      return;
    }
    setPendingFile(file);

    // Auto-trigger AI parsing for image files
    if (file.type.startsWith("image/")) {
      setAiParsing(true);
      setAiResult(null);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1]; // Remove data:image/... prefix
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          const res = await fetch(`${supabaseUrl}/functions/v1/parse-cashup-document`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              imageBase64: base64,
              mimeType: file.type,
              docType: pendingDocType !== "other" ? pendingDocType : "banking_slip",
            }),
          });
          if (res.ok) {
            const result = await res.json();
            setAiResult(result);
            if (result.amount !== null) {
              setPendingEnteredTotal(String(result.amount));
            }
          }
        } catch (err) {
          console.error("AI parse failed:", err);
        }
        setAiParsing(false);
      };
      reader.readAsDataURL(file);
    }
  }, [pendingDocType]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);

    const enteredTotal =
      pendingEnteredTotal !== "" ? parseFloat(pendingEnteredTotal) : null;
    const { status, variance } = computeVerification(
      pendingDocType,
      enteredTotal,
      creditCards,
      cashBanked
    );

    let fileData: string | null = null;
    try {
      fileData = await fileToBase64(pendingFile);
    } catch {
      setUploadError("Failed to read file.");
      setUploading(false);
      return;
    }

    const newDoc: DocumentRecord = {
      id: crypto.randomUUID(),
      cashup_id: cashupId ?? null,
      tenant_id: tenantId,
      doc_type: pendingDocType,
      file_name: pendingFile.name,
      file_size: pendingFile.size,
      verification_status: status,
      variance_amount: variance,
      notes: pendingNotes || null,
      entered_total: enteredTotal,
    };

    // Persist to DB if cashupId is available
    if (cashupId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("cashup_documents").insert({
        id: newDoc.id,
        cashup_id: cashupId,
        tenant_id: tenantId,
        doc_type: pendingDocType,
        file_name: pendingFile.name,
        file_data: fileData,
        file_size: pendingFile.size,
        parsed_data: enteredTotal !== null ? { entered_total: enteredTotal } : null,
        verification_status: status,
        variance_amount: variance,
        notes: pendingNotes || null,
      });

      if (error) {
        setUploadError(error.message);
        setUploading(false);
        return;
      }
    }

    setDocuments((prev) => [...prev, newDoc]);
    setPendingFile(null);
    setPendingDocType("other");
    setPendingEnteredTotal("");
    setPendingNotes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);
  }

  async function handleDelete(id: string) {
    if (cashupId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("cashup_documents").delete().eq("id", id);
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  function updateDocNotes(id: string, notes: string) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, notes } : d)));
    if (cashupId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("cashup_documents").update({ notes }).eq("id", id).then(() => {});
    }
  }

  const showComparison =
    pendingDocType === "cc_batch" || pendingDocType === "banking_slip";
  const comparisonValue =
    pendingDocType === "cc_batch" ? creditCards : cashBanked;
  const comparisonLabel =
    pendingDocType === "cc_batch" ? "Credit Cards (cashup)" : "Cash Banked (cashup)";

  const previewVerification =
    pendingEnteredTotal !== "" && comparisonValue !== null
      ? computeVerification(
          pendingDocType,
          parseFloat(pendingEnteredTotal),
          creditCards,
          cashBanked
        )
      : null;

  return (
    <div className="space-y-6">
      {!cashupId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          Save the cashup first to persist documents to the database. Documents added now will be held in local state only.
        </div>
      )}

      {/* ── Upload area ──────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !pendingFile && fileInputRef.current?.click()}
            className={cn(
              "relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
              dragOver
                ? "border-accent bg-accent/5"
                : pendingFile
                ? "border-green-300 bg-green-50 cursor-default"
                : "border-base-200 hover:border-accent/50 hover:bg-surface-2"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleInputChange}
              className="sr-only"
            />
            {pendingFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText size={20} className="text-green-600" />
                <div className="text-left">
                  <p className="text-sm font-medium text-base-900">{pendingFile.name}</p>
                  <p className="text-xs text-gray-500">{formatBytes(pendingFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <XCircle size={16} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Upload size={24} />
                <p className="text-sm">Drag &amp; drop or <span className="text-accent font-medium">browse</span></p>
                <p className="text-xs">PDF, JPG, PNG — max 2 MB</p>
              </div>
            )}
          </div>

          {uploadError && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <XCircle size={14} />
              {uploadError}
            </p>
          )}

          {/* Document details form */}
          {pendingFile && (
            <div className="bg-surface border border-base-200 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-base-700 mb-1.5">Document Type</label>
                  <select
                    value={pendingDocType}
                    onChange={(e) => setPendingDocType(e.target.value as DocType)}
                    className={cn(selectClass, "w-full")}
                  >
                    {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {showComparison && (
                  <div>
                    <label className="block text-sm font-medium text-base-700 mb-1.5">
                      Total on Document (R)
                    </label>

                    {/* AI parsing status */}
                    {aiParsing && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-700">
                        <div className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full" />
                        Analyzing document with AI...
                      </div>
                    )}

                    {/* AI result */}
                    {aiResult && !aiParsing && (
                      <div className={cn(
                        "flex items-center gap-2 mb-2 px-3 py-2 rounded-lg text-sm",
                        aiResult.confidence === "high" ? "bg-green-50 border border-green-200 text-green-700" :
                        aiResult.confidence === "medium" ? "bg-amber-50 border border-amber-200 text-amber-700" :
                        "bg-gray-50 border border-gray-200 text-gray-600"
                      )}>
                        <span className="font-semibold">
                          AI extracted: R{aiResult.amount?.toFixed(2) ?? "—"}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                          aiResult.confidence === "high" ? "bg-green-200 text-green-800" :
                          aiResult.confidence === "medium" ? "bg-amber-200 text-amber-800" :
                          "bg-gray-200 text-gray-600"
                        )}>
                          {aiResult.confidence}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto truncate max-w-[200px]">{aiResult.rawText}</span>
                      </div>
                    )}

                    <input
                      type="number"
                      step="0.01"
                      placeholder={aiResult?.amount ? String(aiResult.amount) : "0.00"}
                      value={pendingEnteredTotal}
                      onChange={(e) => setPendingEnteredTotal(e.target.value)}
                      className="h-9 w-full rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}
              </div>

              {/* Comparison preview */}
              {showComparison && pendingEnteredTotal !== "" && comparisonValue !== null && (
                <div className={cn(
                  "rounded-lg px-4 py-3 text-sm flex items-center justify-between",
                  previewVerification?.status === "verified"
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : previewVerification?.status === "mismatch"
                    ? "bg-red-50 border border-red-200 text-red-800"
                    : "bg-gray-50 border border-gray-200 text-gray-700"
                )}>
                  <div className="flex items-center gap-2">
                    {previewVerification?.status === "verified" ? (
                      <CheckCircle2 size={15} className="text-green-600" />
                    ) : (
                      <XCircle size={15} className="text-red-600" />
                    )}
                    <span>
                      {comparisonLabel}: <strong>R{comparisonValue.toFixed(2)}</strong>
                      {" "}vs Document: <strong>R{parseFloat(pendingEnteredTotal).toFixed(2)}</strong>
                    </span>
                  </div>
                  {previewVerification != null && previewVerification.variance !== null && previewVerification.variance !== 0 && (
                    <span className="font-semibold">
                      Variance: R{Math.abs(previewVerification.variance).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {showComparison && comparisonValue === null && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Enter {comparisonLabel.toLowerCase()} in the cashup first to enable auto-verification.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-base-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={pendingNotes}
                  onChange={(e) => setPendingNotes(e.target.value)}
                  placeholder="Any notes about this document..."
                  rows={2}
                  className="w-full rounded-lg border border-base-200 bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload Document
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Documents list ────────────────────────────────────────────── */}
      {documents.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No documents uploaded yet.
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500">Uploaded Documents</h3>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                "border rounded-xl p-4 space-y-3 transition-colors",
                doc.verification_status === "verified"
                  ? "border-green-200 bg-green-50/40"
                  : doc.verification_status === "mismatch"
                  ? "border-red-200 bg-red-50/40"
                  : "border-base-200 bg-surface"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={18} className="text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-base-900 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-400">
                      {DOC_TYPE_LABELS[doc.doc_type]}
                      {doc.file_size !== null && ` · ${formatBytes(doc.file_size)}`}
                      {doc.entered_total !== null && ` · Entered: R${doc.entered_total.toFixed(2)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <VerificationBadge status={doc.verification_status} />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Remove document"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Variance info */}
              {doc.variance_amount !== null && doc.variance_amount !== 0 && (
                <div className="text-xs text-red-600 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Variance: R{Math.abs(doc.variance_amount).toFixed(2)}
                  {doc.variance_amount > 0 ? " over" : " under"} cashup amount
                </div>
              )}

              {/* Notes */}
              {!readOnly ? (
                <input
                  type="text"
                  value={doc.notes ?? ""}
                  onChange={(e) => updateDocNotes(doc.id, e.target.value)}
                  placeholder="Add notes..."
                  className="w-full h-8 rounded-lg border border-base-200 bg-surface px-2.5 text-xs text-base-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              ) : (
                doc.notes && (
                  <p className="text-xs text-gray-500 italic">{doc.notes}</p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
