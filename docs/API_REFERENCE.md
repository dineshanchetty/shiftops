# ShiftOps — API Reference

## Table of Contents

1. [Next.js API Routes](#nextjs-api-routes)
   - [POST /api/aura/test-connection](#post-apiauratest-connection)
   - [POST /api/aura/parse-csv](#post-apiauraparse-csv)
   - [POST /api/aura/import](#post-apiauraimport)
   - [POST /api/billing/payfast-notify](#post-apibillingpayfast-notify)
2. [Supabase Edge Functions](#supabase-edge-functions)
   - [aura-ftp-poller](#aura-ftp-poller)
   - [generate-report](#generate-report)
   - [send-notification](#send-notification)

---

## Next.js API Routes

All API routes require authentication unless otherwise noted. Authentication is provided via the Supabase session cookie (set automatically by the Supabase Auth client).

### POST /api/aura/test-connection

Tests an SFTP connection to validate branch Aura FTP credentials before saving.

**Authentication:** Required (Owner or Manager with branch access)

**Request Body:**

```json
{
  "host": "ftp.example.com",
  "username": "aura_user",
  "password": "secret123",
  "exportPath": "/exports/daily"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | SFTP server hostname or IP |
| `username` | string | Yes | SFTP login username |
| `password` | string | Yes | SFTP login password |
| `exportPath` | string | No | Remote directory path to check (defaults to `/`) |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Connection successful",
  "filesFound": 12,
  "sampleFiles": [
    "store01_cashup_20260401.csv",
    "store01_cashup_20260402.csv"
  ]
}
```

**Error Response (400/500):**

```json
{
  "success": false,
  "error": "Connection refused",
  "details": "ECONNREFUSED 192.168.1.100:22"
}
```

---

### POST /api/aura/parse-csv

Parses an uploaded Aura CSV file and returns structured data for preview before import.

**Authentication:** Required (Owner or Manager with branch access)

**Request Body:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | CSV file to parse |
| `branchId` | string | Yes | Branch UUID to associate with |
| `fieldMapping` | string (JSON) | No | Custom field mapping object. Uses tenant default if omitted. |

**Field Mapping Object:**

```json
{
  "gross_turnover": "Column A Header",
  "discounts": "Discount Col",
  "credit_cards": "CC Total",
  "delivery_charges": "Del Charges",
  "cash_banked": "Cash Banked Amount"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "date": "2026-04-01",
    "gross_turnover": 45230.50,
    "discounts": 1200.00,
    "delivery_charges": 3450.00,
    "credit_cards": 18500.00,
    "debtors": 0,
    "stock_take": 2100.00,
    "cash_banked": 22080.50,
    "tx_count": 187,
    "tx_collect": 120,
    "tx_delivery": 67
  },
  "rawHeaders": ["Date", "Gross Sales", "Discounts", "Del Charges", "CC", "Cash"],
  "rowCount": 1,
  "warnings": []
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "CSV parsing failed",
  "details": "Expected column 'Gross Sales' not found in CSV headers",
  "availableHeaders": ["Date", "Total Sales", "Disc", "CC Total"]
}
```

---

### POST /api/aura/import

Processes a confirmed Aura data import after the user has reviewed the parsed preview.

**Authentication:** Required (Owner or Manager with branch access)

**Request Body:**

```json
{
  "branchId": "uuid-of-branch",
  "date": "2026-04-01",
  "sourceFile": "store01_cashup_20260401.csv",
  "parsedData": {
    "gross_turnover": 45230.50,
    "discounts": 1200.00,
    "delivery_charges": 3450.00,
    "credit_cards": 18500.00,
    "debtors": 0,
    "stock_take": 2100.00,
    "cash_banked": 22080.50,
    "tx_count": 187,
    "tx_collect": 120,
    "tx_delivery": 67
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `branchId` | string (uuid) | Yes | Branch to import data for |
| `date` | string (YYYY-MM-DD) | Yes | Cashup date |
| `sourceFile` | string | Yes | Original filename for tracking |
| `parsedData` | object | Yes | Structured cashup data (from parse-csv) |

**Success Response (200):**

```json
{
  "success": true,
  "auraImportId": "uuid-of-import-record",
  "cashupId": "uuid-of-cashup-record",
  "status": "pending_review",
  "message": "Import successful. Cashup record created as draft."
}
```

**Error Response (409):**

```json
{
  "success": false,
  "error": "Import already exists",
  "existingImportId": "uuid",
  "message": "A cashup for this branch and date already exists. Use the cashup form to update."
}
```

---

### POST /api/billing/payfast-notify

PayFast Instant Transaction Notification (ITN) webhook handler. Called by PayFast servers when subscription events occur.

**Authentication:** None (verified via PayFast signature)

**Note:** This endpoint is currently stubbed. The signature verification and subscription lifecycle handling need to be implemented.

**Request Body:** `application/x-www-form-urlencoded` (sent by PayFast)

| Field | Type | Description |
|-------|------|-------------|
| `m_payment_id` | string | ShiftOps internal payment/subscription ID |
| `pf_payment_id` | string | PayFast payment ID |
| `payment_status` | string | `COMPLETE`, `FAILED`, `PENDING`, `CANCELLED` |
| `item_name` | string | Subscription plan name |
| `amount_gross` | string | Payment amount in ZAR |
| `amount_fee` | string | PayFast fee |
| `amount_net` | string | Net amount |
| `token` | string | Subscription token (for recurring) |
| `billing_date` | string | Next billing date |
| `signature` | string | MD5 signature for verification |

**Success Response (200):**

```text
OK
```

PayFast requires a `200 OK` response to confirm receipt. Any non-200 response causes PayFast to retry.

**Processing Logic (to implement):**

1. Verify the PayFast signature using the merchant passphrase.
2. Confirm the request originates from PayFast IP ranges.
3. Verify `payment_status` and `amount_gross` match expected values.
4. Update the tenant's subscription record:
   - `COMPLETE`: Activate/renew subscription, update `plan` and `trial_ends_at`.
   - `CANCELLED`: Downgrade to free plan or lock account.
   - `FAILED`: Log failure, send notification, allow grace period.

---

## Supabase Edge Functions

Edge functions are deployed to Supabase and run on the Deno runtime. Base URL:

```
https://twueamtpxsbejihsmduc.supabase.co/functions/v1/
```

### aura-ftp-poller

Scheduled edge function that polls Aura POS SFTP servers for new cashup CSV exports.

**Endpoint:** `POST /functions/v1/aura-ftp-poller`

**Authentication:** Service role key (no JWT verification — called by pg_cron)

**Schedule:** Every 30 minutes, 6am-11pm SAST (configured via pg_cron)

**Request Body:** None required (empty `{}` is fine)

**Response (200):**

```json
{
  "processed": 5,
  "branches": [
    "Mandela Park",
    "Gateway Mall",
    "Pavilion",
    "Musgrave",
    "Springfield"
  ],
  "message": "FTP poll cycle complete"
}
```

**Response (500):**

```json
{
  "error": "Failed to fetch branches",
  "details": "relation \"branches\" does not exist"
}
```

**Current Status:** SFTP connection logic is stubbed. The function queries branches with FTP configured and logs them, but does not actually connect to SFTP servers. See the inline comments in `supabase/functions/aura-ftp-poller/index.ts` for the implementation plan.

---

### generate-report

Server-side report generation. Returns an HTML document formatted for print/PDF rendering.

**Endpoint:** `POST /functions/v1/generate-report`

**Authentication:** Required (Bearer token — user JWT)

**Request Body:**

```json
{
  "reportType": "daily-banking",
  "branchIds": ["uuid-1", "uuid-2"],
  "startDate": "2026-04-01",
  "endDate": "2026-04-30",
  "tenantId": "uuid-of-tenant"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reportType` | string | Yes | One of the valid report types (see below) |
| `branchIds` | string[] | Yes | Array of branch UUIDs to include |
| `startDate` | string (YYYY-MM-DD) | Yes | Report period start |
| `endDate` | string (YYYY-MM-DD) | Yes | Report period end |
| `tenantId` | string (uuid) | Yes | Must match the JWT's tenant_id |

**Valid Report Types:**

| Type | Description |
|------|-------------|
| `daily-banking` | Daily cash and card reconciliation per branch |
| `monthly-summary` | Aggregated monthly totals per branch |
| `wages-vs-turnover` | Driver wages as percentage of turnover |
| `driver-report` | Individual driver performance (deliveries, wages, fuel) |
| `delivery-cost` | Cost per delivery analysis |
| `online-payments` | Breakdown by online payment channel |
| `global-turnover` | Combined turnover across all selected branches |
| `aura-inconsistency` | Variance between Aura POS data and manual cashup entries |

**Success Response (200):**

Content-Type: `text/html; charset=utf-8`

Returns a complete HTML document with inline CSS, formatted for printing. The client can:
- Open in a new tab and use browser print (Ctrl+P / Cmd+P)
- Use a headless browser to convert to PDF
- Render in an iframe for preview

**Error Response (400):**

```json
{
  "error": "Invalid report type: invalid-type",
  "validTypes": [
    "daily-banking", "monthly-summary", "wages-vs-turnover",
    "driver-report", "delivery-cost", "online-payments",
    "global-turnover", "aura-inconsistency"
  ]
}
```

**Error Response (403):**

```json
{
  "error": "Tenant mismatch — access denied"
}
```

---

### send-notification

Sends transactional email notifications. Currently stubbed with logging.

**Endpoint:** `POST /functions/v1/send-notification`

**Authentication:** Required (Bearer token)

**Request Body:**

```json
{
  "type": "cashup-missing",
  "recipientEmail": "manager@example.com",
  "data": {
    "branchName": "Mandela Park",
    "date": "2026-04-05",
    "managerName": "John",
    "appUrl": "https://app.shiftops.co.za/app/cashup"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Notification type (see below) |
| `recipientEmail` | string | Yes | Recipient email address |
| `data` | object | No | Template variables (type-specific) |

**Notification Types and Template Data:**

#### `cashup-missing`

Sent as a daily reminder when a branch has not submitted its cashup.

| Data Field | Type | Description |
|------------|------|-------------|
| `branchName` | string | Name of the branch |
| `date` | string | The date of the missing cashup |
| `managerName` | string | Manager's first name |
| `appUrl` | string | Direct link to the cashup page |

#### `roster-published`

Sent to staff when a new roster schedule is published.

| Data Field | Type | Description |
|------------|------|-------------|
| `branchName` | string | Name of the branch |
| `period` | string | Roster period (e.g., "1-7 April 2026") |
| `staffName` | string | Staff member's name |
| `appUrl` | string | Direct link to the roster page |

#### `invite`

Sent when a new user is invited to join the tenant.

| Data Field | Type | Description |
|------------|------|-------------|
| `tenantName` | string | Franchise group name |
| `inviterName` | string | Name of the person who sent the invite |
| `inviteUrl` | string | Signup URL with invite token |

**Success Response (200):**

```json
{
  "success": true,
  "stubbed": true,
  "message": "Notification 'cashup-missing' would be sent to manager@example.com",
  "email": {
    "subject": "Cashup Missing — Mandela Park (2026-04-05)",
    "recipientEmail": "manager@example.com",
    "type": "cashup-missing"
  }
}
```

**Current Status:** Stubbed. See the inline comments in `supabase/functions/send-notification/index.ts` for Resend API integration instructions.

---

## Error Codes

All API endpoints follow a consistent error response format:

```json
{
  "error": "Human-readable error message",
  "details": "Technical details (optional)",
  "code": "ERROR_CODE (optional)"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request — missing or invalid parameters |
| 401 | Unauthorized — missing or invalid auth token |
| 403 | Forbidden — user lacks permission (wrong tenant, role, or branch) |
| 404 | Not found |
| 405 | Method not allowed |
| 409 | Conflict — resource already exists |
| 500 | Internal server error |
| 502 | Bad gateway — upstream service error (e.g., email API failure) |
