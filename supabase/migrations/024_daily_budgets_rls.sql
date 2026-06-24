-- Split daily_budgets' wide-open "FOR ALL" tenant policy into read-for-all /
-- write-for-budget-managers. Defense-in-depth behind the admin-only Budget
-- Setup tab (reports.budget_manage). (023 added the permission; this enforces
-- it at the DB — separate file because 023 was already applied.)

DROP POLICY IF EXISTS "Tenant isolation" ON public.daily_budgets;
DROP POLICY IF EXISTS "daily_budgets_select" ON public.daily_budgets;
DROP POLICY IF EXISTS "daily_budgets_write" ON public.daily_budgets;

CREATE POLICY "daily_budgets_select"
  ON public.daily_budgets FOR SELECT
  USING (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "daily_budgets_write"
  ON public.daily_budgets FOR ALL
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND has_permission('reports.budget_manage')
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND has_permission('reports.budget_manage')
  );
