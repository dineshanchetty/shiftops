-- Daily budgets: admin-configurable per-day budget amounts for turnover reports
CREATE TABLE public.daily_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  date date NOT NULL,
  budget_amount numeric(12,2) NOT NULL,
  prev_year_turnover numeric(12,2),
  markup_pct numeric(5,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, date)
);

ALTER TABLE public.daily_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.daily_budgets
  FOR ALL USING (tenant_id = public.get_user_tenant_id());

CREATE INDEX idx_daily_budgets_branch_date ON public.daily_budgets(branch_id, date);
