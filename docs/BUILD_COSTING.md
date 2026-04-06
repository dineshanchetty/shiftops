# ShiftOps — Development Build Costing

**Prepared for:** Naveshen — Consult PGSA
**Prepared by:** Dinesh Anchetty
**Date:** 6 April 2026
**Project:** ShiftOps — Franchise Operations Management Platform

---

## Project Overview

ShiftOps is a multi-tenant SaaS platform built to replace the legacy Blue Lounge PHP system. It provides franchise restaurant groups with modern, mobile-first tools for roster management, daily cashup reconciliation, Aura POS integration, and operational reporting.

## What Was Built

### Core Platform (Phases 1–6)

| Module | Description | Complexity |
|--------|-------------|------------|
| **Auth & Onboarding** | Email/password login, 3-role system (Owner/Manager/Staff), 4-step tenant setup wizard | Medium |
| **App Shell & Design System** | Dark sidebar, responsive layout, bottom tabs for mobile, custom component library (10+ components), Google Fonts integration | Medium |
| **Database & Security** | 17 tables with full Row Level Security, tenant isolation, role-based access control, security headers | High |
| **Aura POS Integration** | SFTP config per branch, CSV parser with field mapper, manual upload wizard, auto-fill cashup from Aura data | High |
| **Roster Module** | Compact month calendar, Gantt timeline daily view, shift editor with position filter, branch operating hours config, PDF export | High |
| **Daily Cashup** | 5-tab form (Takings/Drivers/Banking/Purchases/Attendance), real-time summary panel, variance detection, Aura auto-fill, driver turnover splits | Very High |
| **Staff Management** | Staff table with search/filter, profile slide-over, invite modal, CSV import from payroll reports | Medium |
| **Reporting (10 reports)** | Daily Banking, Monthly Summary, Wages vs Turnover, Driver Report, Delivery Cost, Online Payments, Global Turnover, Aura Inconsistency, Driver Turnover Splits, Sage Pastel Payroll Export | High |
| **Billing & Plans** | PayFast integration (stubbed), 3-tier pricing (Starter/Growth/Enterprise), plan limits, trial management, upgrade prompts | Medium |
| **Attendance Tracking** | Attendance confirmation against roster, actual vs scheduled hours, status tracking (Confirmed/Absent/Late) | Medium |

### Quality & Deployment (Phase 7)

| Item | Description |
|------|-------------|
| **E2E Testing** | 57 Playwright test cases covering auth, onboarding, roster, cashup, reports, staff, settings, API, security |
| **Security Hardening** | AuthProvider context, RoleGuard component, branch-level access guards, CSP headers, middleware role checks |
| **Edge Functions** | 3 Supabase Edge Functions (Aura FTP poller, report generator, email notifications) |
| **CI/CD Pipeline** | GitHub Actions — build, test, deploy to Azure on push to main |
| **Documentation** | Architecture, database schema, API reference, deployment guide, developer handover |
| **Azure Deployment** | App Service (B1 Linux), custom domain configuration |

## Technical Specifications

| Spec | Detail |
|------|--------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **Backend/DB** | Supabase (PostgreSQL), Row Level Security |
| **Hosting** | Azure App Service (B1 Linux, West Europe) |
| **Auth** | Supabase Auth (email/password, 3 roles) |
| **Testing** | Playwright E2E (57 tests) |
| **CI/CD** | GitHub Actions |
| **Repository** | github.com/dineshanchetty/shiftops |

## Code Statistics

| Metric | Count |
|--------|-------|
| Total files | 100+ |
| Lines of code | 16,000+ |
| Database tables | 17 |
| App routes | 32 |
| API endpoints | 4 |
| Edge functions | 3 |
| Test cases | 57 |
| Reports | 10 |
| UI components | 15+ |

## Development Costing

### Option A: Fixed Project Price

| Phase | Effort (days) | Rate/day | Cost |
|-------|--------------|----------|------|
| Phase 1: Foundation + Auth + Onboarding | 5 | R 5,000 | R 25,000 |
| Phase 2: Aura POS Integration | 4 | R 5,000 | R 20,000 |
| Phase 3: Roster Module + Gantt Timeline | 5 | R 5,000 | R 25,000 |
| Phase 4: Daily Cashup (5-tab form) | 5 | R 5,000 | R 25,000 |
| Phase 5: Reports (10 reports) | 5 | R 5,000 | R 25,000 |
| Phase 6: Staff + Billing + Plans | 3 | R 5,000 | R 15,000 |
| Phase 7: Testing + Security + CI/CD + Deployment | 4 | R 5,000 | R 20,000 |
| Design System + UX | 3 | R 5,000 | R 15,000 |
| Documentation + Handover | 2 | R 5,000 | R 10,000 |
| **TOTAL** | **36 days** | | **R 180,000** |

### Option B: SaaS Revenue Share

Instead of a fixed fee, consider a revenue share arrangement:
- Development cost: **R 80,000** (discounted)
- Plus **15% of monthly SaaS subscription revenue** once the platform is sold to other franchise groups
- This aligns incentives — the platform is built to be multi-tenant and can be sold to any franchise group using Aura POS

## Ongoing Costs

| Item | Monthly Cost |
|------|-------------|
| Azure App Service (B1) | ~R 250/mo |
| Supabase (Free tier) | R 0 (up to 500MB, 50K requests) |
| Supabase (Pro — when needed) | ~R 450/mo |
| Domain (shiftops.app) | ~R 250/year |
| **Total hosting** | **~R 250–700/mo** |

## What's Included

- Full source code ownership (GitHub repo)
- Complete documentation for handover
- 17-table database with security policies
- 57 automated tests
- CI/CD pipeline (auto-deploy on git push)
- Azure deployment configured
- 30 days post-launch bug fixes

## Next Steps

1. Review and approve costing
2. Register shiftops.app domain
3. Configure Aura FTP exports with Cosoft
4. Onboard first franchise group
5. Pilot period (2–4 weeks)
6. Full rollout

---

*ShiftOps — Built by Dinesh Anchetty*
*Contact: dineshan@claimtec.co.za*
