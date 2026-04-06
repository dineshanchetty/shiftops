import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import {
  Receipt,
  CalendarDays,
  TrendingUp,
  Truck,
  Package,
  CreditCard,
  Globe,
  AlertTriangle,
  PieChart,
  FileSpreadsheet,
} from "lucide-react";

const reports = [
  {
    title: "Daily Banking Summary",
    description:
      "Daily breakdown of turnover, credit cards, cash banked, and variance.",
    href: "/app/reports/daily-banking",
    icon: Receipt,
  },
  {
    title: "Monthly Summary",
    description:
      "Full month view with turnover, discounts, online payments, and more.",
    href: "/app/reports/monthly-summary",
    icon: CalendarDays,
  },
  {
    title: "Wages vs Turnover",
    description:
      "Labour cost as a percentage of turnover with target tracking.",
    href: "/app/reports/wages-vs-turnover",
    icon: TrendingUp,
  },
  {
    title: "Driver Report",
    description:
      "Per-driver breakdown of deliveries, wages, fuel, and gratuities.",
    href: "/app/reports/driver-report",
    icon: Truck,
  },
  {
    title: "Delivery Cost Analysis",
    description:
      "Delivery costs as a percentage of delivery turnover over time.",
    href: "/app/reports/delivery-cost",
    icon: Package,
  },
  {
    title: "Online Payments Breakdown",
    description:
      "Channel-by-channel online payment totals across the period.",
    href: "/app/reports/online-payments",
    icon: CreditCard,
  },
  {
    title: "Global Turnover",
    description:
      "Side-by-side branch comparison of daily turnover for owners.",
    href: "/app/reports/global-turnover",
    icon: Globe,
  },
  {
    title: "Aura Inconsistency",
    description:
      "Flags days where manual cashup data differs from Aura imports.",
    href: "/app/reports/aura-inconsistency",
    icon: AlertTriangle,
  },
  {
    title: "Driver Turnover Splits",
    description:
      "How delivery turnover is split between drivers.",
    href: "/app/reports/driver-splits",
    icon: PieChart,
  },
  {
    title: "Payroll Export",
    description:
      "Export staff hours and wages for Sage Pastel.",
    href: "/app/reports/payroll-export",
    icon: FileSpreadsheet,
  },
] as const;

export default function ReportsPage() {
  return (
    <PageShell title="Reports">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.href}
              href={report.href}
              className="group rounded-xl bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border border-transparent hover:border-accent/20"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent mb-3">
                <Icon className="h-5 w-5" />
              </div>
              <h3
                className="text-sm font-semibold text-base-900 mb-1 group-hover:text-accent transition-colors"
                style={{
                  fontFamily: 'var(--font-display, "Sora", sans-serif)',
                }}
              >
                {report.title}
              </h3>
              <p className="text-xs text-base-400 leading-relaxed">
                {report.description}
              </p>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
