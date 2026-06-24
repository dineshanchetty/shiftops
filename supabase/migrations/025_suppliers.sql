-- Per-tenant supplier list for the cashup Purchases tab. Admins manage the
-- list; everyone capturing a cashup picks from it. Purchase rows continue to
-- store the supplier NAME in cashup_purchases.item_type, so the existing
-- Purchase & Expense report (grouped by item_type) reports per supplier with
-- no further change.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers (tenant_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Everyone in the tenant can read the supplier list (needed to fill the
-- Purchases dropdown).
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
CREATE POLICY "suppliers_select"
  ON public.suppliers FOR SELECT
  USING (tenant_id = (SELECT get_user_tenant_id()));

-- Writes gated by a new settings.suppliers permission (admins only by default).
DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers;
CREATE POLICY "suppliers_write"
  ON public.suppliers FOR ALL
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND has_permission('settings.suppliers')
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND has_permission('settings.suppliers')
  );

-- Permission catalog entry + grant to Admin only.
INSERT INTO public.permissions (key, description, category) VALUES
  ('settings.suppliers', 'Manage suppliers', 'settings')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'settings.suppliers'
FROM public.roles r
WHERE r.is_system = true AND r.name = 'Admin'
ON CONFLICT DO NOTHING;

-- Seed the legacy hardcoded supplier types for every existing tenant so the
-- dropdown isn't empty on first load.
INSERT INTO public.suppliers (tenant_id, name)
SELECT t.id, v.name
FROM public.tenants t
CROSS JOIN (VALUES ('ABI Purchases'), ('Coca-Cola')) AS v(name)
ON CONFLICT (tenant_id, name) DO NOTHING;
