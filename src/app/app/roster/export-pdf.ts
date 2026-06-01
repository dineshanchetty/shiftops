import type { RosterEntry } from "@/lib/types";
import { formatTime } from "@/lib/utils";

type EntryWithStaff = RosterEntry & {
  staff: {
    first_name: string;
    last_name: string;
    position_id: string | null;
    sub_position_id: string | null;
  };
};

type EntryWithLeave = EntryWithStaff & { leave_type?: string | null };

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeader(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Split the date range into Mon→Sun weeks so each table fits one printable strip. */
function splitIntoWeeks(start: Date, end: Date): { start: Date; days: Date[] }[] {
  const weeks: { start: Date; days: Date[] }[] = [];
  // Anchor on the Monday of the first week.
  const cursor = new Date(start);
  const dow = cursor.getDay();
  const offsetToMonday = dow === 0 ? 6 : dow - 1;
  cursor.setDate(cursor.getDate() - offsetToMonday);

  while (cursor <= end) {
    const days: Date[] = [];
    const weekStart = new Date(cursor);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ start: weekStart, days });
  }
  return weeks;
}

/** Render the in-cell content for one (staff, day) pair, given that staff's entries for that day. */
function renderCell(entries: EntryWithLeave[]): string {
  if (entries.length === 0) {
    return `<span class="cell-empty">·</span>`;
  }
  // Sort: working shifts first (by start), then leave / off.
  const sorted = [...entries].sort((a, b) => {
    if (a.is_off && !b.is_off) return 1;
    if (!a.is_off && b.is_off) return -1;
    return (a.shift_start ?? "").localeCompare(b.shift_start ?? "");
  });

  return sorted
    .map((e) => {
      const lt = e.leave_type ?? null;
      if (e.is_off && (lt === "paid_leave" || lt === "sick")) {
        const label = lt === "sick" ? "SICK" : "LEAVE";
        const hrs = e.shift_hours ?? 0;
        return `<div class="leave"><span class="leave-tag">${label}</span> <span class="leave-hrs">${hrs}h</span></div>`;
      }
      if (e.is_off) {
        return `<div class="off">OFF</div>`;
      }
      const start = e.shift_start ? formatTime(e.shift_start) : "--:--";
      const end = e.shift_end ? formatTime(e.shift_end) : "--:--";
      const hrs = e.shift_hours ?? 0;
      return `<div class="shift"><span class="shift-time">${start}–${end}</span> <span class="shift-hrs">${hrs}h</span></div>`;
    })
    .join("");
}

export function exportRosterPdf(
  entries: EntryWithStaff[],
  branchName: string,
  dateRange: { start: Date; end: Date }
) {
  const typed = entries as EntryWithLeave[];

  // Build the staff list — unique, sorted by name. Show every staff who appears
  // in at least one entry in the range; that's what the screen shows too.
  const staffMap = new Map<
    string,
    { id: string; name: string }
  >();
  for (const e of typed) {
    if (!staffMap.has(e.staff_id)) {
      staffMap.set(e.staff_id, {
        id: e.staff_id,
        name: `${e.staff.first_name} ${e.staff.last_name}`.trim(),
      });
    }
  }
  const staffList = Array.from(staffMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Index: staffId|dateStr -> entries[] (multiple = split shifts on one day)
  const idx = new Map<string, EntryWithLeave[]>();
  for (const e of typed) {
    const key = `${e.staff_id}|${e.date}`;
    const arr = idx.get(key) ?? [];
    arr.push(e);
    idx.set(key, arr);
  }

  const weeks = splitIntoWeeks(dateRange.start, dateRange.end);

  let body = "";
  for (const week of weeks) {
    const weekStart = week.days[0];
    const weekEnd = week.days[6];

    body += `
    <section class="week-block">
      <h2>Week of ${formatFullDate(weekStart)} – ${formatFullDate(weekEnd)}</h2>
      <table>
        <thead>
          <tr>
            <th class="staff-col">Staff</th>
            ${week.days
              .map((d) => {
                const inRange = d >= dateRange.start && d <= dateRange.end;
                return `<th class="${inRange ? "" : "out"}">
                  <div class="day-name">${DAY_HEADERS[(d.getDay() + 6) % 7]}</div>
                  <div class="day-num">${formatDayHeader(d)}</div>
                </th>`;
              })
              .join("")}
            <th class="total-col">Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Per-day grand totals (working hours only — excludes off, includes paid leave).
    const dayTotals = new Array<number>(7).fill(0);
    let grandTotal = 0;

    for (const staff of staffList) {
      let weekTotal = 0;
      let rowHtml = `<tr><td class="staff-col"><span class="staff-name">${staff.name}</span></td>`;

      for (let i = 0; i < 7; i++) {
        const d = week.days[i];
        const inRange = d >= dateRange.start && d <= dateRange.end;
        if (!inRange) {
          rowHtml += `<td class="out"></td>`;
          continue;
        }
        const key = `${staff.id}|${toDateStr(d)}`;
        const dayEntries = idx.get(key) ?? [];
        // Hours = sum of all shift_hours that count (working + paid leave / sick).
        const hrs = dayEntries.reduce((sum, e) => {
          if (!e.is_off) return sum + (e.shift_hours ?? 0);
          if (e.leave_type === "paid_leave" || e.leave_type === "sick") {
            return sum + (e.shift_hours ?? 0);
          }
          return sum;
        }, 0);
        weekTotal += hrs;
        dayTotals[i] += hrs;

        const splitClass = dayEntries.filter((e) => !e.is_off).length > 1 ? " has-split" : "";
        rowHtml += `<td class="cell${splitClass}">${renderCell(dayEntries)}</td>`;
      }

      grandTotal += weekTotal;
      rowHtml += `<td class="total-col"><strong>${weekTotal}h</strong></td></tr>`;
      body += rowHtml;
    }

    // Per-day totals footer
    body += `
        </tbody>
        <tfoot>
          <tr>
            <td class="staff-col"><strong>Daily total</strong></td>
            ${dayTotals
              .map((t, i) => {
                const d = week.days[i];
                const inRange = d >= dateRange.start && d <= dateRange.end;
                return `<td class="${inRange ? "" : "out"}"><strong>${inRange ? `${t}h` : ""}</strong></td>`;
              })
              .join("")}
            <td class="total-col"><strong>${grandTotal}h</strong></td>
          </tr>
        </tfoot>
      </table>
    </section>`;
  }

  const startStr = toDateStr(dateRange.start);
  const endStr = toDateStr(dateRange.end);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Roster — ${branchName} — ${startStr} to ${endStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      color: #111827;
      padding: 12px 14px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .page-header h1 { font-size: 16px; font-weight: 700; }
    .page-header .meta { font-size: 10px; color: #6b7280; text-align: right; }

    .week-block { page-break-inside: avoid; margin-bottom: 16px; }
    .week-block h2 {
      font-size: 11px;
      font-weight: 700;
      color: #374151;
      background: #f3f4f6;
      padding: 4px 8px;
      border-left: 3px solid #2563eb;
      margin-bottom: 4px;
    }

    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 4px 5px; vertical-align: top; font-size: 9.5px; }
    th {
      background: #1f2937; color: #fff; text-align: center;
      font-size: 9px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    th.staff-col, th.total-col { width: 90px; }
    th.out { background: #d1d5db; color: #6b7280; }
    th .day-name { font-size: 9px; }
    th .day-num { font-size: 8px; font-weight: 400; color: #d1d5db; margin-top: 1px; }

    td.staff-col { background: #f9fafb; font-weight: 600; font-size: 10px; }
    td.total-col { text-align: center; background: #f3f4f6; font-size: 10px; }
    td.out { background: #f9fafb; }

    td.cell.has-split { background: #fffbeb; } /* highlight split-shift days */
    .shift {
      display: block; background: #eff6ff; border-left: 2px solid #2563eb;
      padding: 1px 3px; border-radius: 2px; margin-bottom: 2px; line-height: 1.25;
    }
    .shift-time { font-family: ui-monospace, monospace; font-weight: 600; font-size: 9px; color: #1e40af; }
    .shift-hrs  { font-family: ui-monospace, monospace; font-size: 8px; color: #2563eb; }

    .leave {
      display: block; background: #dbeafe; border-left: 2px solid #1d4ed8;
      padding: 1px 3px; border-radius: 2px; line-height: 1.25;
    }
    .leave-tag { font-weight: 700; font-size: 8px; color: #1d4ed8; }
    .leave-hrs { font-family: ui-monospace, monospace; font-size: 8px; color: #1e3a8a; }

    .off {
      display: block; background: #fef3c7; color: #92400e; font-weight: 700;
      font-size: 8px; padding: 1px 3px; border-left: 2px solid #d97706;
      border-radius: 2px; text-align: center;
    }

    .cell-empty { color: #d1d5db; }

    .legend {
      display: flex; gap: 12px; font-size: 9px; color: #6b7280;
      margin-top: 8px; padding-top: 6px; border-top: 1px dashed #d1d5db;
    }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-swatch { display: inline-block; width: 14px; height: 8px; border-radius: 2px; }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; padding: 6mm 8mm; }
      @page { size: A4 landscape; margin: 6mm; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${branchName} — Weekly Roster</h1>
    <div class="meta">
      <div>${startStr} → ${endStr}</div>
      <div>Generated ${new Date().toLocaleString("en-ZA")}</div>
    </div>
  </div>

  ${body}

  <div class="legend">
    <span class="legend-item"><span class="legend-swatch" style="background:#eff6ff;border-left:2px solid #2563eb;"></span> Working shift</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#fffbeb;border:1px solid #f59e0b;"></span> Split-shift day (two or more shifts)</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#dbeafe;border-left:2px solid #1d4ed8;"></span> Paid Leave / Sick (paid)</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#fef3c7;border-left:2px solid #d97706;"></span> OFF (unpaid)</span>
  </div>
</body>
</html>
`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
