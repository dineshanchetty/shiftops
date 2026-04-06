# ShiftOps — Deployment Guide

## Table of Contents

1. [Azure Hosting](#azure-hosting)
2. [Supabase Configuration](#supabase-configuration)
3. [Domain and DNS](#domain-and-dns)
4. [CI/CD with GitHub Actions](#cicd-with-github-actions)

---

## Azure Hosting

### Option A: Azure Static Web Apps (Recommended)

Azure Static Web Apps provides automatic SSL, global CDN, and built-in GitHub Actions integration. This is the recommended option for Next.js deployments.

**Setup Steps:**

1. In the Azure Portal, create a new Static Web App resource.
2. Connect to the GitHub repository `dineshanchetty/shiftops`.
3. Configure the build settings:
   - **App location:** `/`
   - **API location:** (leave empty — API routes are handled by Next.js)
   - **Output location:** `.next`
   - **Build preset:** Next.js
4. Set environment variables in the Azure Portal under Configuration > Application settings.

**Required Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://twueamtpxsbejihsmduc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | `eyJhbGci...` |
| `NEXT_PUBLIC_APP_URL` | Production app URL | `https://app.shiftops.co.za` |
| `PAYFAST_MERCHANT_ID` | PayFast merchant identifier | `10000100` |
| `PAYFAST_MERCHANT_KEY` | PayFast merchant key | `46f0cd69...` |
| `PAYFAST_PASSPHRASE` | PayFast security passphrase | `your-passphrase` |
| `PAYFAST_SANDBOX` | Use PayFast sandbox mode | `false` |

### Option B: Azure App Service with Node.js

For full server-side rendering (SSR) control, use Azure App Service.

**Setup Steps:**

1. Create an App Service resource with Node.js 20 LTS runtime.
2. Configure deployment source as GitHub.
3. Set the startup command: `npm run start`
4. Set environment variables in Configuration > Application settings (same as above).
5. Enable "Always On" to prevent cold starts.

**Build Configuration:**

```bash
npm ci
npm run build
npm run start
```

---

## Supabase Configuration

### Project Details

| Property | Value |
|----------|-------|
| Project ID | `twueamtpxsbejihsmduc` |
| Region | `eu-west-1` (Ireland) |
| Dashboard | https://supabase.com/dashboard/project/twueamtpxsbejihsmduc |

### Edge Functions Deployment

Deploy all three edge functions using the Supabase CLI:

```bash
# Install CLI (if not already installed)
npm install -g supabase

# Login
supabase login

# Link to project
supabase link --project-ref twueamtpxsbejihsmduc

# Deploy edge functions
supabase functions deploy aura-ftp-poller --no-verify-jwt
supabase functions deploy generate-report
supabase functions deploy send-notification
```

Note: `aura-ftp-poller` uses `--no-verify-jwt` because it is invoked by pg_cron (no user JWT). The other functions verify JWTs internally.

### Edge Function Secrets

Set secrets for the edge functions:

```bash
# Email provider (when implemented)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
```

The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to edge functions.

### pg_cron Setup for Aura Poller

Enable the `pg_cron` and `pg_net` extensions in the Supabase Dashboard under Database > Extensions, then run:

```sql
-- Schedule the Aura FTP poller to run every 30 minutes, 6am-11pm SAST
SELECT cron.schedule(
  'aura-ftp-poll',
  '*/30 6-23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://twueamtpxsbejihsmduc.supabase.co/functions/v1/aura-ftp-poller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the schedule
SELECT * FROM cron.job;
```

### Vault Setup for SFTP Credentials

Store SFTP passwords securely using Supabase Vault:

```sql
-- Store a secret
SELECT vault.create_secret('branch_xyz_ftp_pass', 'the-actual-password', 'SFTP password for branch XYZ');

-- Retrieve in edge function or SQL
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'branch_xyz_ftp_pass';
```

### Database Migrations

Migrations are tracked in `supabase/migrations/`. To apply:

```bash
# Push local migrations to remote
supabase db push

# Pull remote schema changes locally
supabase db pull
```

---

## Domain and DNS

### Custom Domain Setup

1. Register domain (e.g., `shiftops.co.za`) via a registrar.
2. In Azure:
   - For Static Web Apps: Settings > Custom domains > Add
   - For App Service: Settings > Custom domains > Add custom domain
3. Add DNS records:
   - **A record:** Point `@` to the Azure IP address
   - **CNAME record:** Point `www` to the Azure-provided hostname
   - **TXT record:** For domain verification (Azure provides the value)

### SSL/TLS

- **Azure Static Web Apps:** Free managed SSL certificates are provisioned automatically.
- **Azure App Service:** Use App Service Managed Certificate (free) or upload a custom certificate.
- **Supabase:** HTTPS is enabled by default for all API and Edge Function endpoints.

---

## CI/CD with GitHub Actions

### Sample Workflow: Azure Static Web Apps

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure Static Web Apps

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [main]

jobs:
  build_and_deploy:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --passWithNoTests

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Deploy to Azure Static Web Apps
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: 'upload'
          app_location: '/'
          output_location: '.next'

  close_pull_request:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    name: Close PR Preview
    steps:
      - name: Close Pull Request
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: 'close'
```

### Sample Workflow: Deploy Supabase Edge Functions

Create `.github/workflows/deploy-functions.yml`:

```yaml
name: Deploy Edge Functions

on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Deploy aura-ftp-poller
        run: supabase functions deploy aura-ftp-poller --no-verify-jwt
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Deploy generate-report
        run: supabase functions deploy generate-report
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Deploy send-notification
        run: supabase functions deploy send-notification
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### GitHub Secrets to Configure

| Secret | Description |
|--------|-------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Azure deployment token |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_PROJECT_ID` | `twueamtpxsbejihsmduc` |
| `SUPABASE_ACCESS_TOKEN` | Personal access token from supabase.com/dashboard/account/tokens |
