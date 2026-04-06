# ShiftOps — Architecture Document

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
│  Next.js 14 App Router (TypeScript + Tailwind)      │
│  ┌──────────┬──────────┬──────────┬──────────┐     │
│  │ Roster   │ Cashup   │ Reports  │ Settings │     │
│  └──────────┴──────────┴──────────┴──────────┘     │
│  Middleware: Auth + Tenant Isolation                  │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│                 Supabase Layer                       │
│  ┌──────────┬──────────┬──────────┬──────────┐     │
│  │ Auth     │ Postgres │ Storage  │ Edge Fn  │     │
│  │ (3 roles)│ (RLS)    │ (files)  │ (FTP)    │     │
│  └──────────┴──────────┴──────────┴──────────┘     │
│  Row Level Security: tenant_id on every table        │
└────────────────────┬────────────────────────────────┘
                     │ SFTP (scheduled)
┌────────────────────▼────────────────────────────────┐
│              External Integrations                    │
│  ┌──────────┬──────────┬──────────┐                 │
│  │ Aura POS │ PayFast  │ Email    │                 │
│  │ (FTP)    │ (billing)│ (invites)│                 │
│  └──────────┴──────────┴──────────┘                 │
└─────────────────────────────────────────────────────┘
```

## Database Schema

### Multi-Tenant Isolation Strategy
- Every table has `tenant_id` column
- Supabase RLS policies enforce isolation: `auth.jwt() -> 'tenant_id' = tenant_id`
- No cross-tenant data access is possible at the DB level

### Core Tables

| Table | Purpose | Key Relations |
|-------|---------|---------------|
| tenants | Franchise groups | Root entity |
| brands | Brand names (Steers, Debonairs) | → tenants |
| branches | Physical stores | → tenants, → brands |
| staff | Employees | → tenants, → branches |
| positions | FOH, BOH, Driver, Manager | → tenants |
| sub_positions | Position sub-types | → tenants, → positions |
| roster_entries | Shift schedule | → tenants, → branches, → staff |
| daily_cashups | Daily financial reconciliation | → tenants, → branches |
| cashup_online_payments | Payment channels per cashup | → daily_cashups |
| cashup_driver_entries | Driver performance per cashup | → daily_cashups, → staff |
| cashup_expenses | Daily expenses | → daily_cashups |
| cashup_purchases | Purchase items | → daily_cashups |
| aura_imports | POS data import tracking | → tenants, → branches |

### Auth & Roles

| Role | Scope | Capabilities |
|------|-------|-------------|
| Owner | All branches in tenant | Full CRUD, reports, billing, settings |
| Manager | Assigned branches only | CRUD on assigned branches, submit cashups |
| Staff | Read-only | View own roster schedule |

Role stored in `auth.users` metadata: `{ role: 'owner' | 'manager' | 'staff', tenant_id: uuid, branch_ids: uuid[] }`

## File Structure

```
src/
├── app/
│   ├── (auth)/           # Login, signup, forgot password
│   │   ├── login/
│   │   ├── signup/
│   │   └── layout.tsx
│   ├── (onboarding)/     # Tenant setup wizard
│   │   └── setup/
│   ├── app/              # Main authenticated app
│   │   ├── layout.tsx    # App shell (sidebar + topbar)
│   │   ├── page.tsx      # Dashboard
│   │   ├── roster/
│   │   ├── cashup/
│   │   ├── reports/
│   │   ├── staff/
│   │   └── settings/
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Landing / redirect
├── components/
│   ├── ui/               # Base components (button, input, etc.)
│   ├── layout/           # Sidebar, topbar, bottom-tabs
│   ├── roster/           # Calendar grid, shift editor
│   ├── cashup/           # Cashup form, driver table
│   └── staff/            # Staff table, profile
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser client
│   │   ├── server.ts     # Server client
│   │   └── middleware.ts  # Auth middleware
│   ├── utils.ts          # cn() helper, formatters
│   └── types.ts          # Database types
├── hooks/                # Custom React hooks
└── styles/
    └── globals.css       # CSS variables, design tokens
```

## Aura Integration Architecture

```
Aura POS (in-store)
  → Cosoft configures scheduled CSV export
    → SFTP server (hosted endpoint)
      → Supabase Edge Function (cron: every 30min, 6am-11pm)
        → Parse CSV with tenant-specific field mapping
          → Insert into aura_imports (status: pending_review)
            → Auto-create/update daily_cashup record
              → Manager reviews & confirms in UI
```

### Fallback: Manual Upload
Manager exports from Aura backoffice → uploads CSV in ShiftOps UI → same parser runs → preview before confirm.

## Deployment Strategy

### Azure Hosting
- Azure Static Web Apps or Azure App Service for Next.js
- Environment variables: Supabase URL, anon key, service role key
- CI/CD: GitHub Actions → Azure deployment

### Supabase
- Project: twueamtpxsbejihsmduc (eu-west-1)
- Migrations tracked in `supabase/migrations/`
- Edge Functions for Aura FTP poller

## Security Considerations
- All SFTP credentials encrypted in Supabase Vault
- RLS enforces tenant isolation at DB level
- JWT tokens carry tenant_id and role
- Manager branch access controlled via branch_ids in JWT
- No cross-tenant data leakage possible
- PayFast webhooks verified with signature
