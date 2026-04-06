# ShiftOps — Developer Handover Document

## Project Overview

ShiftOps is a multi-tenant SaaS platform for franchise restaurant groups in South Africa. It enables franchise operators to manage staff rosters, reconcile daily cashup data (integrated with Aura POS systems), and generate operations reports across multiple brands and branches.

The platform replaces a legacy PHP application ("Blue Lounge") with a modern, mobile-first solution built on Next.js and Supabase.

**Target market:** South African franchise restaurant groups (Steers, Debonairs, Fishaways, and similar quick-service restaurant brands).

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 (App Router) | TypeScript, React Server Components |
| Styling | Tailwind CSS + shadcn/ui | Custom design system with CSS variables |
| Animation | Framer Motion | Page transitions, micro-interactions |
| Forms | React Hook Form + Zod | Validation, field-level errors |
| Tables | TanStack Table | Sortable, filterable data grids |
| Dates | date-fns | Formatting, manipulation |
| Backend | Supabase (PostgreSQL) | Hosted Postgres with REST API |
| Auth | Supabase Auth | Email/password, JWT with custom claims |
| Edge Functions | Supabase Edge Functions (Deno) | FTP polling, report generation, notifications |
| Payments | PayFast | ZAR-native subscription billing |
| POS Integration | Aura (Cosoft) | SFTP-based CSV export |
| Hosting | Azure | Static Web Apps or App Service |
| Repository | GitHub | github.com/dineshanchetty/shiftops |

---

## Repository Structure

```
shiftops/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Auth pages: login, signup, forgot-password
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   └── layout.tsx
│   │   ├── (onboarding)/        # Tenant setup wizard
│   │   │   └── setup/
│   │   ├── app/                  # Main authenticated application
│   │   │   ├── layout.tsx        # App shell (sidebar + topbar)
│   │   │   ├── page.tsx          # Dashboard / home
│   │   │   ├── roster/           # Roster module
│   │   │   ├── cashup/           # Daily cashup module
│   │   │   ├── reports/          # Reports module (8 report types)
│   │   │   ├── staff/            # Staff management
│   │   │   └── settings/         # Tenant, branch, billing settings
│   │   ├── api/                  # Next.js API routes
│   │   │   ├── aura/             # Aura integration endpoints
│   │   │   └── billing/          # PayFast webhook handler
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Landing page / redirect
│   ├── components/
│   │   ├── ui/                   # Base UI components (shadcn/ui)
│   │   ├── layout/               # Sidebar, topbar, bottom-tabs
│   │   ├── roster/               # Calendar grid, shift editor
│   │   ├── cashup/               # Cashup form, driver table
│   │   └── staff/                # Staff table, profile forms
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser Supabase client
│   │   │   ├── server.ts         # Server-side Supabase client
│   │   │   └── middleware.ts     # Auth + tenant middleware
│   │   ├── utils.ts              # cn() helper, formatters
│   │   └── types.ts              # TypeScript types (DB schema)
│   ├── hooks/                    # Custom React hooks
│   └── styles/
│       └── globals.css           # CSS variables, design tokens
├── supabase/
│   ├── migrations/               # SQL migration files
│   └── functions/                # Edge Functions (Deno)
│       ├── aura-ftp-poller/      # Scheduled Aura POS data polling
│       ├── generate-report/      # Server-side HTML report generation
│       └── send-notification/    # Transactional email notifications
├── docs/                         # Project documentation
│   ├── PROJECT_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── DEPLOYMENT.md
│   ├── API_REFERENCE.md
│   └── HANDOVER.md (this file)
├── public/                       # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.local.example
```

---

## Getting Started

### Prerequisites

- Node.js 20 LTS
- npm 10+
- Supabase CLI (`npm install -g supabase`)
- Git

### Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/dineshanchetty/shiftops.git
cd shiftops

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.local.example .env.local

# 4. Fill in .env.local with these values:
#    NEXT_PUBLIC_SUPABASE_URL=https://twueamtpxsbejihsmduc.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase dashboard>
#    SUPABASE_SERVICE_ROLE_KEY=<get from Supabase dashboard>

# 5. Start the development server
npm run dev

# 6. Open http://localhost:3000
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with UI (Vitest)
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

---

## Database

### Supabase Project

- **Project ID:** `twueamtpxsbejihsmduc`
- **Region:** `eu-west-1` (Ireland)
- **Dashboard:** https://supabase.com/dashboard/project/twueamtpxsbejihsmduc

### Viewing the Schema

- Open the Supabase Dashboard > Table Editor to browse tables and data.
- See `docs/DATABASE_SCHEMA.md` for the full schema reference.
- Generated TypeScript types are in `src/lib/types.ts`.

### Running Migrations

```bash
# Link to the project
supabase link --project-ref twueamtpxsbejihsmduc

# Push local migrations to remote
supabase db push

# Pull remote schema changes
supabase db pull

# Create a new migration
supabase migration new <migration_name>
```

### Multi-Tenant Isolation

Every table has a `tenant_id` column. Row Level Security (RLS) policies enforce that users can only access data belonging to their tenant. The tenant ID is embedded in the user's JWT token.

---

## Auth Flow

1. **Signup:** User creates account at `/signup` with email + password.
2. **Onboarding:** First-time users are redirected to `/setup` to create their tenant (franchise group), add brands, create a branch, and optionally invite a manager.
3. **Login:** Returning users log in at `/login` and are redirected to `/app` (dashboard).
4. **Middleware:** The Next.js middleware (`src/lib/supabase/middleware.ts`) checks every `/app/*` request for a valid session and tenant membership.

### JWT Custom Claims

The JWT token contains custom user metadata:

```json
{
  "tenant_id": "uuid",
  "role": "owner | manager | staff",
  "branch_ids": ["uuid", "uuid"]
}
```

---

## Role System

| Role | Scope | Access |
|------|-------|--------|
| **Owner** | All branches in tenant | Full CRUD on all data, reports, billing, settings, user management |
| **Manager** | Assigned branches only | CRUD on assigned branches, submit/edit cashups, view reports for their branches |
| **Staff** | Read-only | View own roster schedule only |

Roles are stored in the `tenant_members` table and in the user's JWT metadata. Branch-level access for managers is controlled via the `branch_ids` array.

### Page Permissions

| Page | Owner | Manager | Staff |
|------|-------|---------|-------|
| Dashboard | Yes | Yes (own branches) | Yes (own schedule) |
| Roster | Full CRUD | Full CRUD (own branches) | Read only |
| Cashup | Full CRUD | Submit + edit (own branches) | No access |
| Reports | All reports | Own branches only | No access |
| Staff Management | Full CRUD | View (own branches) | No access |
| Settings | All settings | Branch settings only | No access |
| Billing | Full access | No access | No access |

---

## Aura POS Integration

Aura is a point-of-sale system by Cosoft used in South African franchise restaurants. It exports daily cashup data as CSV files via SFTP.

### How It Works

1. **Cosoft configures** the Aura system at each branch to export cashup CSV files to an SFTP endpoint on a daily schedule.
2. **The `aura-ftp-poller` edge function** runs every 30 minutes (6am-11pm SAST via pg_cron) and checks each branch's SFTP server for new files.
3. **CSV files are parsed** using the tenant's custom field mapping configuration (different Aura versions may have different column layouts).
4. **Parsed data is stored** in the `aura_imports` table with `status: pending_review`.
5. **A draft cashup record** is auto-created/updated with the Aura data pre-filled.
6. **The manager reviews** the data in the cashup form and confirms or adjusts before submitting.

### Manual Upload Fallback

If FTP polling is not configured, managers can manually export a CSV from Aura's backoffice and upload it through the ShiftOps UI. The same parser runs, and a preview is shown before import confirmation.

### Branch SFTP Configuration

Each branch can have SFTP credentials configured in Settings > Branch > Aura Integration:

- **Host:** SFTP server hostname
- **Username:** SFTP login user
- **Password:** Encrypted via Supabase Vault
- **Export path:** Remote directory containing CSV files

### Field Mapping

Tenants can customize which CSV columns map to which cashup fields via the field mapper UI in Settings. This handles variations in Aura CSV exports across different franchise groups.

---

## Key Design Decisions

1. **Supabase over custom backend:** Provides auth, database, RLS, edge functions, and storage in a single managed service. Reduces infrastructure complexity significantly.

2. **RLS for tenant isolation:** Database-level security ensures no application bug can leak data across tenants. This is the most critical security boundary in the system.

3. **Edge Functions for server-side operations:** FTP polling, report generation, and email sending run on Supabase Edge Functions (Deno) rather than Next.js API routes. This keeps the Next.js app stateless and allows independent scaling.

4. **Aura auto-fill with manual override:** The Aura integration pre-fills cashup data but always allows managers to review and adjust. This balances automation with human oversight and handles cases where POS data is incomplete.

5. **PayFast for payments:** PayFast is the dominant payment gateway in South Africa. It handles ZAR natively, which avoids currency conversion issues for the target market.

6. **shadcn/ui components:** Provides high-quality, customizable base components without the overhead of a full component library. Components are copied into the project and can be freely modified.

7. **Dark sidebar + light content:** This layout pattern is common in operations dashboards. The sidebar uses a dark theme for navigation focus, while the main content area uses a light theme for data readability.

---

## Known Limitations and Future TODOs

### SFTP Client in Edge Function
The `aura-ftp-poller` edge function currently stubs the SFTP connection. Implementing it requires a Deno-compatible SFTP library. The comments in the function describe the exact flow to implement.

### PayFast Subscription Lifecycle
The PayFast ITN (Instant Transaction Notification) webhook handler at `/api/billing/payfast-notify` is stubbed. It needs to handle subscription creation, cancellation, payment failure, and plan changes. PayFast signature verification logic must be implemented.

### Email Notifications
The `send-notification` edge function is stubbed with logging. Production use requires integrating with an email API (Resend is recommended). The email templates are defined but need a real sending mechanism.

### White-Label Theme Provider
Database fields for white-label customization exist in the `tenants` table (`primary_color`, `logo_url`, `brand_name`). A React `ThemeProvider` component needs to be built that reads these values and applies them as CSS custom properties at runtime.

### Roster PDF Generation
Currently handled client-side. For better quality and consistency, roster PDF generation could be moved to the `generate-report` edge function using a server-side HTML-to-PDF approach.

### Budget Hours Per Position
The UI for setting budget hours per position per week exists, but the backend storage (database table or column) for these budget values needs to be created. This would enable actual-vs-budget hour comparisons in reports.

### Additional Future Enhancements
- Push notifications for mobile users (via service worker)
- Multi-language support (Afrikaans, Zulu)
- Offline-capable cashup form (PWA)
- Aura real-time API integration (if Cosoft releases one)
- Staff shift swap requests
- Leave management module
- Inventory tracking integration

---

## Contact

| Role | Name | Email |
|------|------|-------|
| Project Owner | [Name] | [email] |
| Lead Developer | [Name] | [email] |
| Supabase Admin | [Name] | [email] |

For questions about the codebase, open a GitHub issue or reach out via the contact details above.
