# ShiftOps — Project Plan

## Overview
ShiftOps is a multi-tenant SaaS platform for franchise restaurant groups to manage staff rosters, daily cashups, and operations reporting. It replaces the legacy Blue Lounge PHP application with a modern, mobile-first solution.

## Infrastructure

| Component | Service | Details |
|-----------|---------|---------|
| Frontend | Next.js 14 (App Router) | TypeScript, Tailwind CSS, shadcn/ui |
| Backend/DB | Supabase | Project ID: `twueamtpxsbejihsmduc`, Region: eu-west-1 |
| Auth | Supabase Auth | Email/password, 3 roles (owner/manager/staff) |
| Hosting | Azure | TBD — Azure Static Web Apps or App Service |
| POS Integration | Aura (Cosoft) | FTP-based file export, CSV parsing |
| Payments | PayFast | ZAR-native, SA market |
| Repository | GitHub | https://github.com/dineshanchetty/shiftops |

## Tenant Hierarchy
```
Tenant (Franchise Group)
  └── Brands (Steers, Debonairs, Fishaways, etc.)
       └── Branches (physical stores)
            └── Staff (employees)
```

## Phase Breakdown

### Phase 1 — Foundation + SaaS Shell (Week 1-2)
- [x] Next.js 14 + Supabase project init
- [x] GitHub repo created
- [x] Database schema: tenants, brands, branches, staff, positions, sub_positions
- [x] RLS policies for full tenant isolation
- [x] Auth with 3 roles: Owner, Manager, Staff
- [x] App shell: dark sidebar + light content area
- [x] Middleware: tenant membership check on /app/* routes
- [x] Onboarding wizard (company -> brands -> branch -> invite manager)
- [x] Navigation: Home | Roster | Cashup | Reports | Settings

### Phase 2 — Aura Integration Layer (Week 2)
- [x] Supabase Edge Function: aura-ftp-poller
- [x] SFTP connection with encrypted credentials (Supabase Vault)
- [x] CSV parser with configurable field mapping
- [x] aura_imports tracking table
- [x] Manual CSV upload fallback with preview
- [x] Branch settings: SFTP config + test connection + import history
- [x] Field mapper UI for custom Aura column mapping

### Phase 3 — Roster Module (Week 3-4)
- [x] Filter bar: branch, position, sub-position, month/year range
- [x] Mon-Sun calendar grid with shift chips
- [x] Shift entry slide-over panel
- [x] Day-off support ("None" / "OFF")
- [x] Hours totals per day and per period
- [x] Roster PDF export

### Phase 4 — Daily Cashup Module (Week 4-5)
- [x] Cashup form with Aura auto-fill banner
- [x] Driver table auto-populated from roster
- [x] Online payment channels (dynamic per branch)
- [x] Real-time summary panel with variance indicator
- [x] Transaction counts + purchase items
- [x] Submit + lock flow with edit capability

### Phase 5 — Reports Module (Week 5-6)
- [x] Shared report wrapper (branch selector, date range, export CSV/PDF)
- [x] 8 core reports: daily-banking, monthly-summary, wages-vs-turnover,
      driver-report, delivery-cost, online-payments, global-turnover,
      aura-inconsistency

### Phase 6 — SaaS Commercialisation (Week 6-7)
- [x] PayFast integration for ZAR billing
- [x] Tenant plan limits (branch count, user count)
- [x] 14-day free trial
- [x] Billing page with plan management
- [x] White-label support (custom colors, logo, brand name)

### Phase 7 — Testing & Security Hardening (Current)
- [ ] End-to-end tests for critical user flows (auth, cashup, roster)
- [ ] RLS policy audit — verify no cross-tenant data leakage
- [ ] Edge Function deployment and integration testing
- [ ] PayFast webhook signature verification testing
- [ ] SFTP credential Vault integration testing
- [ ] Performance testing: large roster grids, report generation
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Mobile responsive QA across devices
- [ ] Error boundary and fallback UI review
- [ ] Production environment setup and deployment

## Deployment Instructions

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide covering:
- Azure Static Web Apps / App Service setup
- Supabase Edge Function deployment
- pg_cron configuration for Aura poller
- Environment variables and secrets
- CI/CD with GitHub Actions
- Domain and DNS configuration

## Key Differentiators vs Legacy System
1. **Aura auto-fill** — eliminates manual re-entry of POS data
2. **Driver rows from roster** — auto-populated, not manually entered daily
3. **Aura inconsistency report** — compliance/fraud detection tool
4. **Mobile-first** — managers use phones in-store
5. **Multi-franchise SaaS** — one platform, any franchise group

## Tech Stack Details
- Next.js 14 App Router + TypeScript
- Tailwind CSS with custom design system (CSS variables)
- shadcn/ui components (customized)
- Framer Motion for animations
- React Hook Form + Zod for forms
- TanStack Table for data tables
- date-fns for date manipulation
- Supabase JS client + SSR helpers
- Google Fonts: Sora (display), Inter (body), JetBrains Mono (numbers)
