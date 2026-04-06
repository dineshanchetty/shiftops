-- Aura POS field mappings: stores per-tenant column name mappings
-- between Aura CSV exports and ShiftOps daily_cashup fields.
-- Optionally scoped to a specific branch (branch_id).

create table if not exists public.aura_field_mappings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  shiftops_field  text not null,          -- ShiftOps field e.g. 'gross_turnover'
  csv_column      text not null,          -- Aura CSV column header e.g. 'Gross Sales'
  created_at      timestamptz default now(),

  unique (tenant_id, shiftops_field)      -- one mapping per field per tenant
);

-- RLS
alter table public.aura_field_mappings enable row level security;

create policy "Tenant members can view their mappings"
  on public.aura_field_mappings for select
  using (tenant_id = public.get_user_tenant_id());

create policy "Tenant members can insert mappings"
  on public.aura_field_mappings for insert
  with check (tenant_id = public.get_user_tenant_id());

create policy "Tenant members can update mappings"
  on public.aura_field_mappings for update
  using (tenant_id = public.get_user_tenant_id());

create policy "Tenant members can delete mappings"
  on public.aura_field_mappings for delete
  using (tenant_id = public.get_user_tenant_id());
