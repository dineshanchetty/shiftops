"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle2, ArrowRight, FileSpreadsheet } from "lucide-react";
import {
  saveFieldMappings,
  loadFieldMappings,
  parseSampleCsvHeaders,
} from "./actions";
import { SHIFTOPS_FIELDS } from "@/lib/aura-constants";
import type { FieldMapping } from "@/lib/aura-constants";

export default function AuraMappingPage() {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExisting = useCallback(async () => {
    const existing = await loadFieldMappings();
    const map: Record<string, string> = {};
    existing.forEach((m: FieldMapping) => {
      map[m.shiftops_field] = m.csv_column;
    });
    setMappings(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  function updateMapping(fieldName: string, csvColumn: string) {
    setMappings((prev) => ({ ...prev, [fieldName]: csvColumn }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);

    const mappingList = Object.entries(mappings)
      .filter(([, col]) => col.trim() !== "")
      .map(([field, col]) => ({ shiftops_field: field, csv_column: col }));

    const result = await saveFieldMappings(mappingList);

    if (result.success) {
      setSaveResult(`Saved ${result.count} field mapping(s).`);
    } else {
      setSaveResult(`Error: ${result.error}`);
    }
    setSaving(false);
  }

  async function handleFileUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const result = await parseSampleCsvHeaders(formData);

    if ("error" in result) {
      setSaveResult(`Error parsing file: ${result.error}`);
    } else {
      setCsvHeaders(result.headers);
      setSaveResult(
        `Detected ${result.headers.length} columns from "${file.name}".`
      );
    }
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

  const configuredCount = Object.values(mappings).filter(
    (v) => v && v.trim() !== ""
  ).length;

  if (loading) {
    return (
      <PageShell
        title="Aura Field Mapping"
        subtitle="Loading existing mappings..."
      >
        <div className="text-sm text-base-400">Loading...</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Aura Field Mapping"
      subtitle="Map your Aura POS CSV column names to ShiftOps cashup fields."
      action={
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? "Saving..." : "Save Mapping"}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Status bar */}
        {saveResult && (
          <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-base-700 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-accent shrink-0" />
            {saveResult}
          </div>
        )}

        {/* Sample CSV upload */}
        <Card>
          <CardHeader>
            <CardTitle>Auto-detect Columns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-base-500 mb-3">
              Upload a sample Aura CSV export to automatically detect column
              names. You can then select them from dropdowns below.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                dragOver
                  ? "border-accent bg-accent/5"
                  : "border-base-200 hover:border-base-300 hover:bg-surface-2"
              }`}
            >
              <FileSpreadsheet size={32} className="text-base-400" />
              <p className="text-sm font-medium text-base-700">
                Drop a sample CSV here or click to browse
              </p>
              <p className="text-xs text-base-400">
                .csv or .txt files accepted
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>

            {csvHeaders.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="text-xs text-base-400 mr-1">
                  Detected columns:
                </span>
                {csvHeaders.map((h) => (
                  <Badge key={h} variant="info">
                    {h}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Field mapping table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Field Mappings</CardTitle>
              <Badge variant={configuredCount > 0 ? "success" : "default"}>
                {configuredCount} / {SHIFTOPS_FIELDS.length} mapped
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-base-200 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_40px_1fr] gap-4 px-4 py-2.5 bg-surface-2 text-xs font-medium text-base-400 uppercase tracking-wide">
                <span>ShiftOps Field</span>
                <span />
                <span>Aura CSV Column</span>
              </div>

              {/* Rows */}
              {SHIFTOPS_FIELDS.map((field) => (
                <div
                  key={field.name}
                  className="grid grid-cols-[1fr_40px_1fr] gap-4 px-4 py-3 border-t border-base-100 items-center"
                >
                  <div>
                    <p className="text-sm font-medium text-base-800">
                      {field.label}
                    </p>
                    <p className="text-xs text-base-400 font-mono">
                      {field.name}
                    </p>
                  </div>

                  <ArrowRight size={14} className="text-base-300 mx-auto" />

                  <div>
                    {csvHeaders.length > 0 ? (
                      <select
                        value={mappings[field.name] ?? ""}
                        onChange={(e) =>
                          updateMapping(field.name, e.target.value)
                        }
                        className="w-full rounded-lg border border-base-200 bg-surface px-3 h-10 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                      >
                        <option value="">-- Select column --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        compact
                        value={mappings[field.name] ?? ""}
                        onChange={(e) =>
                          updateMapping(field.name, e.target.value)
                        }
                        placeholder="Enter CSV column name"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save size={16} />
                {saving ? "Saving..." : "Save Mapping"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
