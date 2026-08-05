-- Per-category report access: payroll/wage reports get their own permission
-- so admins can control which roles see them via Settings → Roles.
--
-- Gates: Payroll Export, Wages vs Turnover, Wages Hours vs Budget,
-- Global Wages Comparison.
--
-- Granted to the Admin system role only. The stock Manager role does NOT get
-- it — tick it on the Ops (or any custom) role in the Roles UI to grant.

INSERT INTO public.permissions (key, description, category) VALUES
  ('reports.payroll', 'View payroll / wage reports', 'reports')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'reports.payroll'
FROM public.roles r
WHERE r.is_system = true AND r.name = 'Admin'
ON CONFLICT DO NOTHING;
