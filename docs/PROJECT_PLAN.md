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

### Phase 1 — Foundation + SaaS Shell (Week 1–2)
- [x] Next.js 14 + Supabase project init
- [x] GitHub repo created
- [ ] Database schema: tenants, brands, branches, staff, positions, sub_positions
- [ ] RLS policies for full tenant isolation
- [ ] Auth with 3 roles: Owner, Manager, Staff
- [ ] App shell: dark sidebar + light content area
- [ ] Middleware: tenant membership check on /app/* routes
- [ ] Onboarding wizard (company → brands → branch → invite manager)
- [ ] Navigation: Home | Roster | Cashup | Reports | Settings

### Phase 2 — Aura Integration Layer (Week 2)
- [ ] Supabase Edge Function: aura-ftp-poller
- [ ] SFTP connection with encrypted credentials (Supabase Vault)
- [ ] CSV parser with configurable field mapping
- [ ] aura_imports tracking table
- [ ] Manual CSV upload fallback with preview
- [ ] Branch settings: SFTP config + test connection + import history
- [ ] Field mapper UI for custom Aura column mapping

### Phase 3 — Roster Module (Week 3–4)
- [ ] Filter bar: branch, position, sub-position, month/year range
- [ ] Mon-Sun calendar grid with shift chips
- [ ] Shift entry slide-over panel
- [ ] Day-off support ("None" / "OFF")
- [ ] Hours totals per day and per period
- [ ] Roster PDF export

### Phase 4 — Daily Cashup Module (Week 4–5)
- [ ] Cashup form with Aura auto-fill banner
- [ ] Driver table auto-populated from roster
- [ ] Online payment channels (dynamic per branch)
- [ ] Real-time summary panel with variance indicator
- [ ] Transaction counts + purchase items
- [ ] Submit + lock flow with edit capability

### Phase 5 — Reports Module (Week 5–6)
- [ ] Shared report wrapper (branch selector, date range, export CSV/PDF)
- [ ] 8 core reports: daily-banking, monthly-summary, wages-vs-turnover,
      driver-report, delivery-cost, online-payments, global-turnover,
      aura-inconsistency

### Phase 6 — SaaS Commercialisation (Week 6–7)
- [ ] PayFast integration for ZAR billing
- [ ] Tenant plan limits (branch count, user count)
- [ ] 14-day free trial
- [ ] Billing page with plan management
- [ ] White-label support (custom colors, logo, brand name)

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
