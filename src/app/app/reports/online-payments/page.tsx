"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportWrapper, type ReportFilters } from "@/components/reports/report-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { generateCSV, triggerDownload } from "@/lib/report-utils";
import { CreditCard, Hash, CalendarDays } from "lucide-react";

const KNOWN_CHANNELS = ["Aura", "Yumbi", "Wi-Group", "Mr D", "UberEats"];

interface OnlineRow {
  date: string;
  channels: Record<string, number>;
  total: number;
}

export default function OnlinePaymentsPage() {
  const supabase = createClient();
  const [data, setData] = useState<OnlineRow[]>([]);
  const [allChannels, setAllChannels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(
    async (f: ReportFilters) => {
      if (f.branchIds.length === 0) return;
      setLoading(true);

      const { data: cashups } = await supabase
        .from("daily_cashups")
        .select("id, date, cashup_online_payments(channel, amount)")
        .in("branch_id", f.branchIds)
        .gte("date", f.dateFrom)
        .lte("date", f.dateTo)
        .order("date", { ascending: true });

      if (cashups) {
        const channelSet = new Set<string>();
        const byDate = new Map<string, OnlineRow>();

        for (const c of cashups as (Record<string, unknown> & { date: string; cashup_online_payments: { channel: string; amount: number | null }[] })[]) {
          const payments = c.cashup_online_payments ?? [];
          for (const p of payments) {
            const ch = p.channel ?? "Unknown";
            channelSet.add(ch);
            const existing = byDate.get(c.date);
            if (existing) {
              existing.channels[ch] = (existing.channels[ch] ?? 0) + (p.amount ?? 0);
              existing.total += p.amount ?? 0;
            } else {
              byDate.set(c.date, { date: c.date, channels: { [ch]: p.amount ?? 0 }, total: p.amount ?? 0 });
            }
          }
        }

        const sortedChannels = Array.from(channelSet).sort((a, b) => {
          const ai = KNOWN_CHANNELS.indexOf(a);
          const bi = KNOWN_CHANNELS.indexOf(b);
          if (ai >= 0 && bi >= 0) return ai - bi;
          if (ai >= 0) return -1;
          if (bi >= 0) return 1;
          return a.localeCompare(b);
        });

        setAllChannels(sortedChannels);
        setData(Array.from(byDate.values()));
      } else {
        setData([]);
        setAllChannels([]);
      }
      setLoading(false);
    },
    [supabase]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", ...allChannels, "Total Online"];
    const rows = data.map((r) => [r.date, ...allChannels.map((ch) => r.channels[ch] ?? 0), r.total]);
    triggerDownload(generateCSV(headers, rows), "online-payments.csv", "text/csv");
  }, [data, allChannels]);

  const grandTotal = data.reduce((s, r) => s + r.total, 0);
  const channelTotals = allChannels.map((ch) => ({ channel: ch, total: data.reduce((s, r) => s + (r.channels[ch] ?? 0), 0) }));
  const topChannel = channelTotals.length > 0 ? channelTotals.reduce((a, b) => (a.total > b.total ? a : b)) : null;

  return (
    <ReportWrapper title="Online Payments Breakdown" onRun={handleRun} onExportCSV={handleExportCSV}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Online Payments" value={formatCurrency(grandTotal)} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Top Channel" value={topChannel?.channel ?? "-"} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Channel Count" value={allChannels.length} icon={<Hash className="h-5 w-5" />} />
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-base-400">
          <CalendarDays className="h-12 w-12 mb-3" />
          <p className="text-sm">No data for selected period</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2">Date</th>
                {allChannels.map((ch) => (
                  <th key={ch} className="text-right px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2">{ch}</th>
                ))}
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide font-semibold text-base-400 sticky top-0 bg-surface-2">Total Online</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className="border-b border-base-200 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 text-base-900">{formatDate(row.date)}</td>
                  {allChannels.map((ch) => (
                    <td key={ch} className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(row.channels[ch] ?? 0)}</td>
                  ))}
                  <td className="px-4 py-2 text-right font-mono font-semibold text-base-900">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-base-900">Totals</td>
                {channelTotals.map((ct) => (
                  <td key={ct.channel} className="px-4 py-2 text-right font-mono text-base-900">{formatCurrency(ct.total)}</td>
                ))}
                <td className="px-4 py-2 text-right font-mono font-semibold text-base-900">{formatCurrency(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportWrapper>
  );
}
