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

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildWeeks(
  start: Date,
  end: Date
): (Date | null)[][] {
  const weeks: (Date | null)[][] = [];
  const firstDay = new Date(start);
  const dayOfWeek = firstDay.getDay();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  firstDay.setDate(firstDay.getDate() - offset);

  const lastDay = new Date(end);
  const endDayOfWeek = lastDay.getDay();
  const endOffset = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  lastDay.setDate(lastDay.getDate() + endOffset);

  const cursor = new Date(firstDay);
  while (cursor <= lastDay) {
    const week: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (cursor >= start && cursor <= end) {
        week.push(new Date(cursor));
      } else {
        week.push(null);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

export function exportRosterPdf(
  entries: EntryWithStaff[],
  branchName: string,
  dateRange: { start: Date; end: Date }
) {
  // Group entries by date
  const entriesByDate = new Map<string, EntryWithStaff[]>();
  for (const entry of entries) {
    const key = entry.date;
    if (!entriesByDate.has(key)) entriesByDate.set(key, []);
    entriesByDate.get(key)!.push(entry);
  }

  const weeks = buildWeeks(dateRange.start, dateRange.end);

  const startStr = toDateStr(dateRange.start);
  const endStr = toDateStr(dateRange.end);

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Roster - ${branchName} - ${startStr} to ${endStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10px; color: #1a1a1a; }
    .header { padding: 16px; border-bottom: 2px solid #333; margin-bottom: 8px; }
    .header h1 { font-size: 16px; font-weight: 700; }
    .header p { font-size: 11px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #1f2937; color: white; padding: 6px 4px; text-align: center; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    td { border: 1px solid #e5e7eb; padding: 4px; vertical-align: top; min-height: 60px; font-size: 9px; }
    td.empty { background: #f9fafb; }
    .date-num { font-weight: 700; font-size: 10px; margin-bottom: 3px; color: #374151; }
    .shift { background: #f0f4ff; border-radius: 3px; padding: 2px 4px; margin-bottom: 2px; }
    .shift-off { background: #f3f4f6; }
    .shift-name { font-weight: 600; font-size: 9px; }
    .shift-time { font-family: monospace; font-size: 8px; color: #6b7280; }
    .total { margin-top: 3px; padding-top: 2px; border-top: 1px solid #e5e7eb; font-family: monospace; font-size: 8px; color: #9ca3af; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      @page { size: landscape; margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${branchName} - Weekly Roster</h1>
    <p>${startStr} to ${endStr}</p>
  </div>
  <table>
    <thead>
      <tr>
        ${DAY_HEADERS.map((d) => `<th>${d}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
`;

  for (const week of weeks) {
    html += "      <tr>\n";
    for (const date of week) {
      if (!date) {
        html += '        <td class="empty"></td>\n';
        continue;
      }

      const dateStr = toDateStr(date);
      const dayEntries = entriesByDate.get(dateStr) ?? [];
      const totalHours = dayEntries.reduce(
        (sum, e) => sum + (e.is_off ? 0 : (e.shift_hours ?? 0)),
        0
      );

      html += "        <td>\n";
      html += `          <div class="date-num">${date.getDate()}</div>\n`;

      for (const entry of dayEntries) {
        const name = `${entry.staff.first_name} ${entry.staff.last_name.charAt(0)}.`;
        if (entry.is_off) {
          html += `          <div class="shift shift-off"><span class="shift-name">${name}</span> <span class="shift-time">OFF</span></div>\n`;
        } else {
          const start = entry.shift_start ? formatTime(entry.shift_start) : "--:--";
          const end = entry.shift_end ? formatTime(entry.shift_end) : "--:--";
          const hrs = entry.shift_hours ?? 0;
          html += `          <div class="shift"><span class="shift-name">${name}</span><br><span class="shift-time">${start}-${end} (${String(hrs).padStart(2, "0")}:00)</span></div>\n`;
        }
      }

      if (dayEntries.length > 0) {
        html += `          <div class="total">Total: ${totalHours.toFixed(0).padStart(2, "0")}:00</div>\n`;
      }

      html += "        </td>\n";
    }
    html += "      </tr>\n";
  }

  html += `
    </tbody>
  </table>
</body>
</html>
`;

  // Open in new window for printing
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    // Give the browser a moment to render, then trigger print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}
