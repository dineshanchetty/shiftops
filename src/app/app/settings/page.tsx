"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { GitBranch, Link2, UserCog, CreditCard, ArrowRight } from "lucide-react";

const settingsCards = [
  {
    title: "Branch Settings",
    description: "Manage your branches, brands, and locations.",
    href: "/app/settings/branches",
    icon: GitBranch,
  },
  {
    title: "Aura Integration",
    description:
      "Map your Aura POS CSV columns to ShiftOps fields for automated cashup imports.",
    href: "/app/settings/aura-mapping",
    icon: Link2,
  },
  {
    title: "Billing & Plan",
    description:
      "View your subscription, usage, and manage your billing plan.",
    href: "/app/settings/billing",
    icon: CreditCard,
  },
  {
    title: "Account Settings",
    description:
      "Manage your organisation details and team members.",
    href: "/app/settings/account",
    icon: UserCog,
  },
];

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      subtitle="Manage your branches, integrations, and account."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsCards.map((card) => (
          <Link key={card.href} href={card.href} className="block group">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <card.icon size={20} />
                  </div>
                  <CardTitle>{card.title}</CardTitle>
                </div>
                <CardDescription className="mt-2">
                  {card.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent group-hover:gap-2 transition-all">
                  Manage
                  <ArrowRight size={14} />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
