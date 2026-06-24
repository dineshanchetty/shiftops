-- Dedicated permission for editing the Turnover-vs-Budget setup (daily budgets,
-- markup). Admin-only by default — managers/ops managers must not change budgets.

INSERT INTO public.permissions (key, description, category) VALUES
  ('reports.budget_manage', 'Set up / edit daily budgets', 'reports')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Grant to every tenant's Admin (system, all perms) — already covered by the
-- Admin = all-permissions rule, but make it explicit and idempotent.
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'reports.budget_manage'
FROM public.roles r
WHERE r.is_system = true AND r.name = 'Admin'
ON CONFLICT DO NOTHING;

-- Do NOT grant to Manager — budgets stay admin-only. Any tenant that had a
-- custom role with the (now-removed) implicit budget access keeps only what's
-- explicitly granted; budget editing is gated on this new key going forward.

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_budgets RLS — split the wide-open "FOR ALL" tenant policy into
-- read-for-all / write-for-budget-managers (defense in depth behind the UI).
-- ─────────────────────────────────────────────────────────────────────────────

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
