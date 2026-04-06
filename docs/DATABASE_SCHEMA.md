# ShiftOps — Database Schema Reference

## Entity Relationship Diagram

```
tenants ──┬── brands ──── branches ──┬── staff
          │                          ├── roster_entries
          │                          ├── daily_cashups ──┬── cashup_online_payments
          │                          │                   ├── cashup_driver_entries
          │                          │                   ├── cashup_expenses
          │                          │                   └── cashup_purchases
          │                          └── aura_imports
          ├── positions ── sub_positions
          └── tenant_members (auth link)
```

## Table Definitions

### tenants
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| name | text NOT NULL | Franchise group name |
| slug | text UNIQUE NOT NULL | URL-safe identifier |
| plan | text DEFAULT 'trial' | trial, starter, growth, enterprise |
| billing_email | text | |
| primary_color | varchar(7) | White-label hex color |
| logo_url | text | White-label logo |
| brand_name | varchar(100) | White-label platform name |
| trial_ends_at | timestamptz | |
| created_at | timestamptz DEFAULT now() | |

### brands
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| name | text NOT NULL | e.g. "Debonairs Pizza" |
| logo_url | text | |
| color_hex | varchar(7) | Brand accent color |
| created_at | timestamptz DEFAULT now() | |

### branches
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| brand_id | uuid FK → brands | |
| name | text NOT NULL | e.g. "Mandela Park" |
| address | text | |
| aura_ftp_host | text | SFTP connection |
| aura_ftp_user | text | |
| aura_ftp_pass_encrypted | text | Stored via Vault |
| aura_export_path | text | Remote directory |
| timezone | text DEFAULT 'Africa/Johannesburg' | |
| created_at | timestamptz DEFAULT now() | |

### positions
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| name | text NOT NULL | FOH, BOH, Driver, Manager |
| created_at | timestamptz DEFAULT now() | |

### sub_positions
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| position_id | uuid FK → positions | |
| name | text NOT NULL | |
| created_at | timestamptz DEFAULT now() | |

### staff
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| branch_id | uuid FK → branches | Primary branch |
| auth_user_id | uuid FK → auth.users | Nullable — not all staff have app access |
| first_name | text NOT NULL | |
| last_name | text NOT NULL | |
| email | text | |
| phone | text | |
| id_number | text | SA ID number |
| position_id | uuid FK → positions | |
| sub_position_id | uuid FK → sub_positions | |
| employment_type | text | permanent, fixed_term, casual |
| active | boolean DEFAULT true | |
| start_date | date | |
| created_at | timestamptz DEFAULT now() | |

### tenant_members
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| user_id | uuid FK → auth.users | |
| role | text NOT NULL | owner, manager, staff |
| branch_ids | uuid[] | For managers: which branches they can access |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE(tenant_id, user_id) | | |

### roster_entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| branch_id | uuid FK → branches | |
| staff_id | uuid FK → staff | |
| date | date NOT NULL | |
| shift_start | time | Null if day off |
| shift_end | time | |
| shift_hours | numeric(4,2) | Auto-calculated |
| is_off | boolean DEFAULT false | |
| notes | text | |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE(branch_id, staff_id, date) | | |

### daily_cashups
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| branch_id | uuid FK → branches | |
| date | date NOT NULL | |
| gross_turnover | numeric(12,2) DEFAULT 0 | |
| discounts | numeric(12,2) DEFAULT 0 | |
| delivery_charges | numeric(12,2) DEFAULT 0 | |
| credit_cards | numeric(12,2) DEFAULT 0 | |
| debtors | numeric(12,2) DEFAULT 0 | |
| stock_take | numeric(12,2) DEFAULT 0 | |
| drinks_stock_take | numeric(12,2) DEFAULT 0 | |
| cash_banked | numeric(12,2) DEFAULT 0 | |
| cc_batch_total | numeric(12,2) DEFAULT 0 | |
| shop_float | numeric(12,2) DEFAULT 0 | |
| tx_count | integer DEFAULT 0 | |
| tx_collect | integer DEFAULT 0 | |
| tx_delivery | integer DEFAULT 0 | |
| comment | text | |
| aura_import_id | uuid FK → aura_imports | If auto-filled |
| status | text DEFAULT 'draft' | draft, submitted |
| created_by | uuid FK → auth.users | |
| submitted_at | timestamptz | |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE(branch_id, date) | | |

### cashup_online_payments
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cashup_id | uuid FK → daily_cashups | |
| channel | text NOT NULL | aura, yumbi, wi_group, mr_d, ubereats |
| amount | numeric(12,2) DEFAULT 0 | |

### cashup_driver_entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cashup_id | uuid FK → daily_cashups | |
| staff_id | uuid FK → staff | |
| turnover | numeric(12,2) DEFAULT 0 | |
| wages | numeric(12,2) DEFAULT 0 | |
| charges | numeric(12,2) DEFAULT 0 | |
| delivery_count | integer DEFAULT 0 | |
| fuel_cost | numeric(12,2) DEFAULT 0 | |
| gratuities | numeric(12,2) DEFAULT 0 | |

### cashup_expenses
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cashup_id | uuid FK → daily_cashups | |
| category | text | |
| description | text | |
| amount | numeric(12,2) DEFAULT 0 | |

### cashup_purchases
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cashup_id | uuid FK → daily_cashups | |
| item_type | text | ABI, supplier categories |
| amount | numeric(12,2) DEFAULT 0 | |

### aura_imports
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | RLS |
| branch_id | uuid FK → branches | |
| source_file | text | Filename |
| import_date | date | |
| status | text DEFAULT 'pending' | pending, pending_review, applied, error |
| raw_data | jsonb | Original parsed data |
| parsed_at | timestamptz | |
| error_log | text | |
| created_at | timestamptz DEFAULT now() | |

## RLS Policy Pattern

Every table follows this pattern:
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON {table}
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

For `tenant_members`, additional policies control role-based access.
For `cashup_*` child tables, access is through the parent cashup's tenant_id via JOIN.
