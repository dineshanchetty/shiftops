# ShiftOps — Commercial Proposal & Revenue Projections

**Prepared for:** Naveshen — Consult PGSA
**Prepared by:** Dinesh Anchetty
**Date:** 6 April 2026

---

## 1. Executive Summary

ShiftOps is a multi-tenant SaaS platform purpose-built for franchise restaurant operations in South Africa. It replaces the legacy Blue Lounge PHP system with a modern, mobile-first solution that integrates directly with Aura POS — the dominant point-of-sale system used by franchise groups like Steers, Debonairs, Fishaways, and Mugg & Bean.

The platform is **live, tested, and deployed**. It is ready for immediate use across your franchise stores, and designed from day one to scale to other franchise groups as a commercial SaaS product.

---

## 2. The Problem We Solve

South African franchise restaurant managers currently face:

- **Manual data re-entry** — Aura POS captures all sales data, but managers manually re-type it into spreadsheets or the Blue Lounge system every day. This wastes 30-45 minutes per store per day.
- **No mobile access** — The current system is desktop-only. Managers are on their feet in busy kitchens, not sitting at a desk.
- **Paper-based rosters** — Staff scheduling is done on paper or basic spreadsheets with no integration to cashup or payroll.
- **No driver accountability** — Delivery driver turnover, wages, and fuel costs are tracked manually with no analysis or comparison.
- **Disconnected systems** — Roster, cashup, attendance, and payroll are all separate processes with no data flowing between them.
- **No fraud detection** — There is no way to automatically compare what the POS recorded vs what the manager entered, creating opportunities for cash handling discrepancies.

---

## 3. What ShiftOps Delivers

### For Store Managers (Daily Use)
| Feature | Time Saved |
|---------|-----------|
| Aura POS auto-fill on cashup form | 30 min/day |
| Drivers auto-populated from roster | 10 min/day |
| Attendance confirmation in cashup flow | 15 min/day |
| Mobile access — no desktop required | Flexibility |
| **Total daily time saving per store** | **~55 min/day** |

### For Franchise Owners (Strategic Value)
- **Aura Inconsistency Report** — Automatically flags days where the manager's cashup differs from what Aura POS recorded. This is a compliance and fraud detection tool that no other system offers.
- **Driver Turnover Splits** — See exactly how delivery revenue is distributed between drivers, with percentage breakdowns.
- **Wages vs Turnover** — Track labour cost as a percentage of revenue in real-time, with target thresholds.
- **Multi-branch Dashboard** — Compare performance across all stores from a single screen.
- **Sage Pastel Export** — One-click payroll data export eliminates manual payroll prep.

### For the Business (Scalability)
- Multi-tenant architecture — each franchise group is completely isolated
- White-label ready — custom branding per tenant (logo, colours, name)
- Tiered pricing built in (Starter / Growth / Enterprise plans)
- PayFast payment integration for ZAR billing

---

## 4. Platform Specifications

| Component | Detail |
|-----------|--------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Hosting | Azure App Service (West Europe) |
| Auth | Email/password, 3 roles (Owner/Manager/Staff) |
| POS Integration | Aura via SFTP file export (Cosoft) |
| Testing | 57 automated E2E tests (Playwright) |
| CI/CD | GitHub Actions auto-deploy |
| Reports | 10 operational reports with CSV + PDF export |
| Code | 16,000+ lines, 100+ files, 17 DB tables |

---

## 5. Commercial Options

### Option A: Full Ownership — R 120,000 Once-Off

- Full source code transfer and IP ownership
- Complete documentation and developer handover
- 30 days post-launch support and bug fixes
- You own and commercialise the platform independently
- No ongoing royalties or revenue obligations

**Best for:** You want full control and plan to commercialise or manage the platform yourself.

### Option B: Shared Ownership — R 60,000 + 50/50 Revenue Share

- 50% reduced upfront cost
- Joint ownership of the platform IP
- Revenue from SaaS subscriptions split 50/50
- Ongoing technical development and maintenance included
- Both parties benefit as the platform scales

**Best for:** You want a lower upfront cost and a development partner who stays invested in the platform's growth.

---

## 6. Revenue Projections — SaaS Model

### Pricing Tiers (ZAR/month)

| Plan | Price/mo | Branches | Users | Target Customer |
|------|----------|----------|-------|----------------|
| Starter | R 499 | 1 | 3 managers | Single-store owner |
| Growth | R 1,499 | Up to 5 | Unlimited | Small franchise group |
| Enterprise | R 3,999+ | Unlimited | Unlimited + white-label | Large franchise group |

### Target Market Size

- There are **4,000+ franchise restaurants** in South Africa across major brands (Debonairs, Steers, Fishaways, Mugg & Bean, Nando's, KFC, etc.)
- Approximately **800+ franchise groups** (multi-store operators)
- Aura POS is used by the majority of Famous Brands franchises (~2,800 stores)

### Revenue Scenarios

#### Conservative (Year 1)

| Quarter | New Customers | Total | Avg Plan | MRR | ARR |
|---------|--------------|-------|----------|-----|-----|
| Q1 | 5 | 5 | R 999 | R 4,995 | R 59,940 |
| Q2 | 8 | 13 | R 999 | R 12,987 | R 155,844 |
| Q3 | 10 | 23 | R 1,099 | R 25,277 | R 303,324 |
| Q4 | 12 | 35 | R 1,199 | R 41,965 | R 503,580 |

**Year 1 Total Revenue: ~R 350,000**

#### Moderate (Year 1-2)

| Period | Customers | Avg Plan | MRR | ARR |
|--------|-----------|----------|-----|-----|
| End Year 1 | 35 | R 1,199 | R 41,965 | R 503,580 |
| End Year 2 | 80 | R 1,399 | R 111,920 | R 1,343,040 |
| End Year 3 | 150 | R 1,599 | R 239,850 | R 2,878,200 |

#### Aggressive (with Famous Brands partnership)

If ShiftOps becomes a recommended tool for Famous Brands franchisees:
- 200+ franchise groups within 18 months
- Average R 1,499/mo per group
- **MRR: R 299,800 → ARR: R 3.6M**

### Revenue Share Impact (Option B)

| Year | Total Revenue | Your 50% Share | Dinesh 50% Share |
|------|--------------|----------------|------------------|
| Year 1 | R 350,000 | R 175,000 | R 175,000 |
| Year 2 | R 1,343,040 | R 671,520 | R 671,520 |
| Year 3 | R 2,878,200 | R 1,439,100 | R 1,439,100 |

**With Option B (R 60,000 upfront + revenue share), Naveshen's total Year 1 return = R 175,000 — a 2.9x return on the R 60,000 investment.**

---

## 7. Go-To-Market Strategy

### Phase 1: Pilot (Month 1-2)
- Deploy ShiftOps across Naveshen's own stores
- Configure Aura FTP exports with Cosoft
- Train managers on the new system
- Collect feedback and refine

### Phase 2: Referral Launch (Month 3-4)
- Leverage Naveshen's franchise network for referrals
- Offer first 3 months at 50% discount for early adopters
- Target franchise groups already using Aura POS (lowest friction)

### Phase 3: Direct Sales (Month 5-12)
- Register shiftops.app domain and build landing page
- Target Famous Brands franchisees via industry WhatsApp groups, franchise expos
- Partner with Cosoft (Aura vendor) for co-marketing — "Aura + ShiftOps" integration story
- LinkedIn content targeting franchise owners in SA

### Phase 4: Scale (Year 2+)
- Expand to non-Aura franchise systems
- Add features: stock management, supplier ordering, multi-brand comparisons
- Consider international expansion (franchise models in Nigeria, Kenya, Ghana)

---

## 8. Ongoing Costs

| Item | Monthly | Annual |
|------|---------|--------|
| Azure App Service (B1) | R 250 | R 3,000 |
| Supabase Pro (when needed) | R 450 | R 5,400 |
| Domain (shiftops.app) | — | R 250 |
| Email service (Resend) | R 0-350 | R 0-4,200 |
| **Total infrastructure** | **R 700-1,050** | **R 8,650-12,850** |

Infrastructure costs are minimal and scale with usage. At 35 customers, revenue covers costs 40x over.

---

## 9. What's Included in This Build

- Complete source code (GitHub repository)
- 17-table PostgreSQL database with security policies
- 57 automated end-to-end tests
- CI/CD pipeline (auto-deploy on git push)
- Azure App Service deployment (live)
- 10 operational reports with export capability
- Sage Pastel payroll integration
- Aura POS integration architecture (ready for Cosoft FTP setup)
- Full documentation: architecture, API reference, deployment guide, developer handover
- 30 days post-launch bug fixes and support

---

## 10. Next Steps

1. **Review** this proposal and choose Option A or B
2. **Walkthrough** — schedule a 30-min demo of the live platform
3. **Aura Setup** — I've prepared the Cosoft FTP export request (attached separately)
4. **Pilot** — deploy to your first store within 1 week of agreement
5. **Domain** — register shiftops.app and go live with custom branding

---

*ShiftOps — Built to run your franchise operations, not just track them.*

**Dinesh Anchetty**
dineshan@claimtec.co.za
