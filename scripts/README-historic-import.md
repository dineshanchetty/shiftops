# Historic Data Import

One-shot CLI to import 13 months of historic turnover + payroll PDFs into `daily_cashups` and `roster_entries`. Uses OpenAI gpt-4o to parse the PDFs.

## Setup

Provide three secrets via environment variables OR a file:

```bash
# Option A — inline export
export SUPABASE_URL="https://twueamtpxsbejihsmduc.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<get from Supabase Dashboard → Settings → API>"
export OPENAI_API_KEY="<your key>"

# Option B — file
cat > /tmp/import-secrets.env <<EOF
SUPABASE_URL=https://twueamtpxsbejihsmduc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
EOF
export SHIFTOPS_IMPORT_ENV=/tmp/import-secrets.env
```

## Usage

```bash
cd /Users/dineshanchetty/pgsa/shiftops

# 1) List branches + PDFs + write mapping template
node scripts/import-historic.mjs --list

# 2) Edit /tmp/import-mapping.json — paste branch UUIDs from step 1

# 3) Dry run (parses all PDFs, writes /tmp/import-dryrun.json — NO DB writes)
node scripts/import-historic.mjs --dry-run

# 4) Review /tmp/import-dryrun.json + add unmapped staff → mapping file

# 5) Re-run dry-run to confirm

# 6) Apply
node scripts/import-historic.mjs --apply

# Restrict to one branch or type while testing
node scripts/import-historic.mjs --dry-run --branch "DEB MP"
node scripts/import-historic.mjs --apply --branch "DEB MP" --type turnover
node scripts/import-historic.mjs --dry-run --pdf "DEB MP MARCH 26.pdf"
```

## What gets written

- **daily_cashups**: `gross_turnover = Actual Nett × 1.15` (VAT factor configurable). `status='historic'`. Other fields stay NULL.
- **roster_entries**: `shift_hours` from payroll PDF. `shift_start`/`shift_end` stay NULL. `is_off=true` when 0 hours.

## Idempotency

Re-running `--apply` is safe:
- Cashup rows already with `status` of `submitted` or `verified` are skipped.
- Cashup rows with non-null `gross_turnover` are skipped.
- Roster entries with `shift_start` already set are skipped.
- Otherwise rows are upserted.

## Estimated cost

~50 turnover PDFs × $0.01 + 4 payroll PDFs × $0.05 ≈ **$0.70 OpenAI cost**.

## Files

- `scripts/import-historic.mjs` — the CLI
- `/tmp/import-mapping.json` — branch + staff mapping (you edit)
- `/tmp/import-dryrun.json` — dry-run output preview
