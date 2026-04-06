"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Branch } from "@/lib/types";

/** ShiftOps cashup fields that we try to map. */
const CASHUP_FIELDS = [
  "gross_turnover",
  "discounts",
  "delivery_charges",
  "credit_cards",
  "debtors",
  "stock_take",
  "drinks_stock_take",
  "tx_count",
  "tx_collect",
  "tx_delivery",
] as const;

type Step = "upload" | "preview" | "confirm" | "done";

export default function AuraUploadPage() {
  const searchParams = useSearchParams();
  const preselectedBranch = searchParams.get("branch");
  const supabase = createClient();

  const [step, setStep] = useState<Step>("upload");
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(
    preselectedBranch ?? ""
  );
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed CSV data
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [fileName, setFileName] = useState("");

  // Mapping: ShiftOps field -> CSV column
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});

  // Import result
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    cashupId?: string;
  } | null>(null);

  // Parsing state
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Load branches and saved field mappings
  const loadData = useCallback(async () => {
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return;

    const { data: branchData } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name");

    setBranches(branchData ?? []);

    // Load saved field mappings
    const { data: mappings } = await supabase
      .from("aura_field_mappings")
      .select("shiftops_field, csv_column")
      .eq("tenant_id", tenantId);

    if (mappings && mappings.length > 0) {
      const map: Record<string, string> = {};
      mappings.forEach((m: { shiftops_field: string; csv_column: string }) => {
        map[m.shiftops_field] = m.csv_column;
      });
      setFieldMap(map);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleFileUpload(file: File) {
    setParsing(true);
    setParseError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/aura/parse-csv", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setParseError(err.error || "Failed to parse file");
        setParsing(false);
        return;
      }

      const data = await res.json();
      setCsvHeaders(data.headers);
      setCsvRows(data.rows);
      setCsvRowCount(data.rowCount);

      // Auto-match field mappings if we have saved mappings
      // (already loaded into fieldMap)
      setStep("preview");
    } catch {
      setParseError("Network error uploading file");
    }
    setParsing(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }

  function updateMapping(field: string, csvCol: string) {
    setFieldMap((prev) => ({ ...prev, [field]: csvCol }));
  }

  function buildMappedData(): Record<string, string | number> {
    // Use the first data row and the field mapping to produce mapped data
    // For a daily cashup, we typically aggregate or use the first/only row
    const row = csvRows[0] ?? {};
    const result: Record<string, string | number> = {};

    for (const field of CASHUP_FIELDS) {
      const csvCol = fieldMap[field];
      if (csvCol && row[csvCol] !== undefined) {
        const val = row[csvCol].replace(/[^0-9.\-]/g, "");
        const num = parseFloat(val);
        if (!isNaN(num)) result[field] = num;
      }
    }

    return result;
  }

  async function handleConfirmImport() {
    if (!selectedBranch || !date) return;

    setImporting(true);
    setImportResult(null);

    const mappedData = buildMappedData();

    try {
      const res = await fetch("/api/aura/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranch,
          date,
          mappedData,
          sourceFile: fileName,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setImportResult({
          success: true,
          message: data.isUpdate
            ? "Cashup updated from Aura data."
            : "New cashup created from Aura data.",
          cashupId: data.cashupId,
        });
        setStep("done");
      } else {
        setImportResult({
          success: false,
          message: data.error || "Import failed",
        });
      }
    } catch {
      setImportResult({ success: false, message: "Network error" });
    }

    setImporting(false);
  }

  const mappedCount = CASHUP_FIELDS.filter(
    (f) => fieldMap[f] && fieldMap[f].trim() !== ""
  ).length;

  return (
    <PageShell
      title="Aura CSV Upload"
      subtitle="Manually import cashup data from an Aura POS export file."
    >
      <div className="space-y-6 max-w-4xl">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          {(
            [
              { key: "upload", label: "1. Upload" },
              { key: "preview", label: "2. Preview & Map" },
              { key: "confirm", label: "3. Confirm" },
              { key: "done", label: "4. Done" },
            ] as const
          ).map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && (
                <ArrowRight size={12} className="text-base-300" />
              )}
              <span
                className={cn(
                  "font-medium",
                  step === s.key
                    ? "text-accent"
                    : "text-base-400"
                )}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Aura CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Branch selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-base-700">
                  Branch
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full rounded-lg border border-base-200 bg-surface px-3 h-10 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                >
                  <option value="">-- Select branch --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date picker */}
              <Input
                label="Cashup Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              {/* File dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors",
                  dragOver
                    ? "border-accent bg-accent/5"
                    : "border-base-200 hover:border-base-300 hover:bg-surface-2"
                )}
              >
                {parsing ? (
                  <>
                    <Loader2
                      size={32}
                      className="text-accent animate-spin"
                    />
                    <p className="text-sm font-medium text-base-700">
                      Parsing file...
                    </p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={32} className="text-base-400" />
                    <p className="text-sm font-medium text-base-700">
                      Drop your Aura CSV here or click to browse
                    </p>
                    <p className="text-xs text-base-400">
                      Accepts .csv, .txt, and .tsv files
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv,.xlsx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

              {parseError && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={16} />
                  {parseError}
                </div>
              )}

              {!selectedBranch && (
                <p className="text-xs text-base-400">
                  Please select a branch before uploading.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Preview & Map */}
        {step === "preview" && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    File Preview — {fileName}
                  </CardTitle>
                  <Badge variant="info">
                    {csvRowCount} row{csvRowCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Scrollable data preview */}
                <div className="overflow-x-auto rounded-lg border border-base-200 max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 sticky top-0">
                      <tr>
                        {csvHeaders.map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-xs font-medium text-base-500 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 10).map((row, i) => (
                        <tr
                          key={i}
                          className="border-t border-base-100"
                        >
                          {csvHeaders.map((h) => (
                            <td
                              key={h}
                              className="px-3 py-2 whitespace-nowrap text-base-700 font-mono text-xs"
                            >
                              {row[h] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvRows.length > 10 && (
                  <p className="text-xs text-base-400 mt-2">
                    Showing first 10 of {csvRowCount} rows.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Column mapping */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Map Columns</CardTitle>
                  <Badge
                    variant={mappedCount > 0 ? "success" : "default"}
                  >
                    {mappedCount} / {CASHUP_FIELDS.length} mapped
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-base-200 overflow-hidden">
                  <div className="grid grid-cols-[1fr_40px_1fr_120px] gap-4 px-4 py-2.5 bg-surface-2 text-xs font-medium text-base-400 uppercase tracking-wide">
                    <span>ShiftOps Field</span>
                    <span />
                    <span>CSV Column</span>
                    <span className="text-right">Sample Value</span>
                  </div>
                  {CASHUP_FIELDS.map((field) => {
                    const csvCol = fieldMap[field] ?? "";
                    const sampleValue =
                      csvCol && csvRows[0] ? csvRows[0][csvCol] : "";

                    return (
                      <div
                        key={field}
                        className="grid grid-cols-[1fr_40px_1fr_120px] gap-4 px-4 py-3 border-t border-base-100 items-center"
                      >
                        <span className="text-sm font-medium text-base-800">
                          {field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <ArrowRight
                          size={14}
                          className="text-base-300 mx-auto"
                        />
                        <select
                          value={csvCol}
                          onChange={(e) =>
                            updateMapping(field, e.target.value)
                          }
                          className="w-full rounded-lg border border-base-200 bg-surface px-3 h-9 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                        >
                          <option value="">-- Skip --</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <span className="text-right text-xs font-mono text-base-500 truncate">
                          {sampleValue || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between mt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setStep("upload")}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep("confirm")}
                    disabled={mappedCount === 0}
                  >
                    Review Import
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm Import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-surface-2 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-base-500">Branch</span>
                  <span className="font-medium text-base-800">
                    {branches.find((b) => b.id === selectedBranch)?.name ??
                      "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-500">Date</span>
                  <span className="font-medium text-base-800">{date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-500">Source File</span>
                  <span className="font-medium text-base-800">
                    {fileName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-500">Mapped Fields</span>
                  <span className="font-medium text-base-800">
                    {mappedCount}
                  </span>
                </div>
              </div>

              {/* Show mapped values */}
              <div className="rounded-lg border border-base-200 overflow-hidden">
                <div className="grid grid-cols-2 gap-4 px-4 py-2 bg-surface-2 text-xs font-medium text-base-400 uppercase tracking-wide">
                  <span>Field</span>
                  <span className="text-right">Value</span>
                </div>
                {CASHUP_FIELDS.filter(
                  (f) => fieldMap[f] && fieldMap[f].trim() !== ""
                ).map((field) => {
                  const csvCol = fieldMap[field];
                  const rawValue = csvRows[0]?.[csvCol] ?? "";
                  const numValue = parseFloat(
                    rawValue.replace(/[^0-9.\-]/g, "")
                  );

                  return (
                    <div
                      key={field}
                      className="grid grid-cols-2 gap-4 px-4 py-2.5 border-t border-base-100 text-sm"
                    >
                      <span className="text-base-700">
                        {field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <span className="text-right font-mono text-base-900">
                        {!isNaN(numValue) && field !== "tx_count" && field !== "tx_collect" && field !== "tx_delivery"
                          ? formatCurrency(numValue)
                          : rawValue}
                      </span>
                    </div>
                  );
                })}
              </div>

              {importResult && !importResult.success && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={16} />
                  {importResult.message}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setStep("preview")}
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={importing}
                >
                  {importing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Confirm Import
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Done */}
        {step === "done" && importResult?.success && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-soft)]">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-base-900">
                Import Successful
              </h2>
              <p className="text-sm text-base-500 text-center max-w-md">
                {importResult.message} The cashup data has been saved and
                is now available in the Cashup section.
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep("upload");
                    setCsvHeaders([]);
                    setCsvRows([]);
                    setFileName("");
                    setImportResult(null);
                  }}
                >
                  Upload Another
                </Button>
                <Button
                  onClick={() =>
                    (window.location.href = "/app/cashup")
                  }
                >
                  View Cashups
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
