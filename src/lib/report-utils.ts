/**
 * Utility functions shared across all report pages.
 */

/** Build a CSV string from headers + rows and return it. */
export function generateCSV(
  headers: string[],
  rows: (string | number)[][]
): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  return lines.join("\n");
}

/** Trigger a file download in the browser. */
export function triggerDownload(
  content: string,
  filename: string,
  type: string
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Calculate variance between expected and actual values. */
export function calculateVariance(
  expected: number,
  actual: number
): { amount: number; percentage: number } {
  const amount = actual - expected;
  const percentage = expected === 0 ? 0 : (amount / expected) * 100;
  return { amount, percentage };
}

/** Group an array of records by a date field and return a Map. */
export function aggregateByDate<T extends Record<string, unknown>>(
  data: T[],
  dateField: string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of data) {
    const key = String(row[dateField] ?? "");
    const arr = map.get(key) ?? [];
    arr.push(row);
    map.set(key, arr);
  }
  return map;
}

/** Group records by an arbitrary field, summing numeric values. */
export function aggregateByField<T extends Record<string, unknown>>(
  data: T[],
  field: string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of data) {
    const key = String(row[field] ?? "");
    const arr = map.get(key) ?? [];
    arr.push(row);
    map.set(key, arr);
  }
  return map;
}

/** Sum a numeric field across an array of records. */
export function sumField<T extends Record<string, unknown>>(
  data: T[],
  field: string
): number {
  return data.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
}
