import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Calculator,
  ClipboardCheck,
  BarChart3,
  Plug,
  Building2,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: member } = await supabase
      .from("tenant_members")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!member) {
      redirect("/setup");
    }

    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-[var(--color-base-200)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-[var(--font-display)] text-xl font-bold tracking-tight">
              <span className="text-[var(--color-base-900)]">Shift</span>
              <span className="text-[var(--color-accent)]">Ops</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--color-base-600)]">
            <a href="#features" className="hover:text-[var(--color-base-900)] transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-[var(--color-base-900)] transition-colors">
              Pricing
            </a>
            <a href="#how-it-works" className="hover:text-[var(--color-base-900)] transition-colors">
              How It Works
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-[var(--color-base-600)] hover:text-[var(--color-base-900)] transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] px-4 py-2 rounded-lg transition-all active:scale-[0.98]"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-base-50)] via-white to-[#FFF8EE]" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-base-900) 1px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[var(--font-display)] text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="text-[var(--color-base-900)]">Shift</span>
            <span className="text-[var(--color-accent)]">Ops</span>
          </h1>
          <p className="font-[var(--font-display)] text-2xl sm:text-3xl font-semibold text-[var(--color-base-800)] mb-4 max-w-3xl mx-auto">
            Run your franchise operations, not just track them.
          </p>
          <p className="text-lg text-[var(--color-base-600)] max-w-2xl mx-auto mb-10 leading-relaxed">
            The modern platform that replaces manual cashups, paper rosters, and
            disconnected systems for South African franchise restaurants.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-base font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] px-8 py-3.5 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-base-700)] bg-white border border-[var(--color-base-200)] hover:border-[var(--color-base-400)] px-8 py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              See How It Works
              <ChevronRight className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* App Preview Mockup */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
          <div className="rounded-xl border border-[var(--color-base-200)] shadow-2xl shadow-indigo-100 overflow-hidden bg-white">
            {/* Browser chrome */}
            <div className="bg-[var(--color-base-50)] border-b border-[var(--color-base-200)] px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white rounded-md border border-[var(--color-base-200)] px-4 py-1 text-xs text-[var(--color-base-400)] font-mono">
                  shiftops.app/app
                </div>
              </div>
            </div>
            {/* App mockup content */}
            <div className="flex">
              {/* Sidebar mock */}
              <div className="hidden sm:block w-48 bg-[var(--color-base-800)] p-4 min-h-[320px]">
                <div className="text-white font-bold text-sm mb-6">ShiftOps</div>
                <div className="space-y-1">
                  {["Dashboard", "Roster", "Cashup", "Staff", "Reports", "Settings"].map((item, i) => (
                    <div key={item} className={`px-3 py-2 rounded-lg text-xs font-medium ${i === 0 ? "bg-[var(--color-accent)] text-white" : "text-gray-400"}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              {/* Content mock */}
              <div className="flex-1 p-6 bg-gray-50">
                <div className="text-lg font-bold text-gray-900 mb-4">Dashboard</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: "BRANCHES", value: "5" },
                    { label: "CASHUPS", value: "4 of 5" },
                    { label: "MISSING", value: "1" },
                    { label: "TURNOVER", value: "R 273K" },
                  ].map((card) => (
                    <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-3">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{card.label}</div>
                      <div className="text-xl font-bold text-gray-900 mt-1 font-mono">{card.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-3">Today&apos;s Roster</div>
                  <div className="space-y-2">
                    {[
                      { name: "Bosisiwe Z.", pos: "FOH", time: "08:00 - 16:00", color: "bg-green-500" },
                      { name: "Motlalepule M.", pos: "Driver", time: "11:00 - 21:00", color: "bg-orange-500" },
                      { name: "Siphamandla M.", pos: "Driver", time: "11:00 - 21:00", color: "bg-orange-500" },
                    ].map((s) => (
                      <div key={s.name} className="flex items-center gap-3 text-xs text-gray-600">
                        <div className={`w-2 h-2 rounded-full ${s.color}`} />
                        <span className="font-medium text-gray-900 w-28">{s.name}</span>
                        <span className="text-gray-400 w-12">{s.pos}</span>
                        <span className="font-mono text-gray-500">{s.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof Bar ── */}
      <section className="py-12 bg-[var(--color-base-50)] border-y border-[var(--color-base-200)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-[var(--color-base-400)] uppercase tracking-wider mb-8">
            Trusted by franchise groups across South Africa
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 mb-10">
            {["Steers", "Debonairs", "Fishaways", "Mugg & Bean"].map((brand) => (
              <span
                key={brand}
                className="text-lg sm:text-xl font-bold text-[var(--color-base-200)] select-none"
              >
                {brand}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12">
            {[
              { value: "55 min/day", label: "saved per store" },
              { value: "10", label: "reports" },
              { value: "Aura POS", label: "integrated" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-[var(--color-base-900)]">{stat.value}</p>
                <p className="text-sm text-[var(--color-base-400)]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[var(--color-base-900)] mb-4">
              Everything your stores need, in one place
            </h2>
            <p className="text-lg text-[var(--color-base-600)] max-w-2xl mx-auto">
              Purpose-built for South African franchise restaurants. No
              workarounds, no spreadsheets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: CalendarDays,
                title: "Smart Roster",
                desc: "Schedule staff in seconds, not spreadsheets.",
                details:
                  "Gantt timeline view, position-based scheduling, mobile-friendly for managers on the floor.",
                color: "bg-blue-50 text-blue-600",
              },
              {
                icon: Calculator,
                title: "Daily Cashup",
                desc: "Know your numbers before you leave the store.",
                details:
                  "Aura POS auto-fill, driver turnover splits, real-time variance detection against targets.",
                color: "bg-orange-50 text-orange-600",
              },
              {
                icon: ClipboardCheck,
                title: "Attendance",
                desc: "Every shift accounted for.",
                details:
                  "Confirm actual hours vs scheduled, integrated directly into the cashup flow.",
                color: "bg-green-50 text-green-600",
              },
              {
                icon: BarChart3,
                title: "10 Reports",
                desc: "From cashup to payroll in one click.",
                details:
                  "Daily banking, wages vs turnover, Pastel payroll export, and more. All automated.",
                color: "bg-purple-50 text-purple-600",
              },
              {
                icon: Plug,
                title: "Aura Integration",
                desc: "Stop re-typing what Aura already knows.",
                details:
                  "Auto-import POS data via FTP. One-time Cosoft setup, then it just works.",
                color: "bg-cyan-50 text-cyan-600",
              },
              {
                icon: Building2,
                title: "Multi-Branch",
                desc: "One platform, every store.",
                details:
                  "Dashboard across all stores with role-based access. Franchise owners see everything.",
                color: "bg-rose-50 text-rose-600",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-[var(--color-base-200)] bg-white p-8 hover:shadow-lg hover:shadow-[var(--color-base-200)]/60 transition-all duration-300"
              >
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${feature.color} mb-5`}
                >
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-base-900)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-base font-medium text-[var(--color-base-700)] mb-2">
                  {feature.desc}
                </p>
                <p className="text-sm text-[var(--color-base-400)] leading-relaxed">
                  {feature.details}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-[#0F1117] scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-[#94a3b8] max-w-xl mx-auto">
              14-day free trial. No credit card required. Cancel any time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: "Starter",
                price: "R 499",
                period: "/mo",
                desc: "For single-store operators",
                features: [
                  "1 branch",
                  "3 manager accounts",
                  "Daily cashup",
                  "Smart roster",
                  "Attendance tracking",
                  "5 core reports",
                  "Email support",
                ],
                highlighted: false,
              },
              {
                name: "Growth",
                price: "R 1,499",
                period: "/mo",
                desc: "For growing franchise groups",
                features: [
                  "Up to 5 branches",
                  "Unlimited users",
                  "All 10 reports",
                  "Aura POS integration",
                  "Pastel payroll export",
                  "Multi-branch dashboard",
                  "Priority support",
                ],
                highlighted: true,
              },
              {
                name: "Enterprise",
                price: "R 3,999",
                period: "/mo",
                desc: "For large franchise networks",
                features: [
                  "Unlimited branches",
                  "Unlimited users",
                  "All Growth features",
                  "White-label branding",
                  "Custom report builder",
                  "API access",
                  "Dedicated account manager",
                ],
                highlighted: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "bg-[#1a1d2e] border-2 border-[var(--color-accent)] shadow-lg shadow-indigo-200/50"
                    : "bg-[#1a1d2e] border border-[#2a2d3e]"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[var(--color-accent)] text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                  <p className="text-sm text-[#94a3b8]">{plan.desc}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-[#94a3b8]">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-[#cbd5e1]">
                      <CheckCircle2 className="w-4 h-4 text-[var(--color-accent)] mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`w-full text-center font-semibold rounded-xl px-4 py-3 transition-all active:scale-[0.98] ${
                    plan.highlighted
                      ? "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                      : "bg-[#2a2d3e] text-white hover:bg-[#3a3d4e] border border-[#3a3d4e]"
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[var(--color-base-900)] mb-4">
              Up and running in minutes
            </h2>
            <p className="text-lg text-[var(--color-base-600)] max-w-xl mx-auto">
              No lengthy onboarding. Your managers start using it today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: "1",
                title: "Sign up & add your stores",
                desc: "Create your account and add your branches in under 2 minutes.",
              },
              {
                step: "2",
                title: "Connect Aura POS exports",
                desc: "One-time Cosoft FTP setup. We handle the rest automatically.",
              },
              {
                step: "3",
                title: "Your managers start using it",
                desc: "Invite your team. Cashups, rosters, and reports from day one.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FFF8EE] border-2 border-[var(--color-accent)]/20 text-[var(--color-accent)] font-bold text-xl mb-5">
                  {item.step}
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-base-900)] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-[var(--color-base-600)] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-[#0F1117] to-[#1a1d2e]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to modernise your franchise ops?
          </h2>
          <p className="text-lg text-[#94a3b8] mb-10 max-w-xl mx-auto">
            Join franchise groups across South Africa who have ditched
            spreadsheets for ShiftOps.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-base font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] px-8 py-3.5 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="mailto:info@shiftops.co.za"
              className="text-base font-medium text-[#94a3b8] hover:text-white transition-colors"
            >
              Or book a demo &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 bg-[#0F1117] border-t border-[#1a1d2e]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="font-[var(--font-display)] text-lg font-bold tracking-tight">
                <span className="text-white">Shift</span>
                <span className="text-[var(--color-accent)]">Ops</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[#94a3b8]">
              <a href="#features" className="hover:text-white transition-colors">
                Features
              </a>
              <a href="#pricing" className="hover:text-white transition-colors">
                Pricing
              </a>
              <Link href="/login" className="hover:text-white transition-colors">
                Login
              </Link>
              <Link href="/signup" className="hover:text-white transition-colors">
                Sign Up
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-[#1a1d2e] flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#64748b]">
            <p>Built for South African franchise restaurants</p>
            <a
              href="mailto:info@shiftops.co.za"
              className="hover:text-[#94a3b8] transition-colors"
            >
              info@shiftops.co.za
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
