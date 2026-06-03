-- RBAC foundation: catalog of permissions, per-tenant roles, role-permission
-- grants, and helpers. Existing 'owner' / 'manager' string roles on
-- tenant_members stay in place for backward compat; a new role_id column
-- points to the new roles table and is backfilled.
--
-- Drop 1 establishes the data model + adds branch-access plumbing.
-- Custom-role UI + per-permission gating across the app land in Drop 2.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Permissions catalog — global, static
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY,
  description text NOT NULL,
  category    text NOT NULL CHECK (category IN ('cashup','roster','staff','reports','settings','team','system'))
);

INSERT INTO public.permissions (key, description, category) VALUES
  ('cashup.view',        'View cashups',                            'cashup'),
  ('cashup.edit',        'Create / edit draft cashups',             'cashup'),
  ('cashup.submit',      'Submit a cashup',                         'cashup'),
  ('cashup.unlock',      'Unlock a submitted cashup',               'cashup'),
  ('cashup.delete',      'Delete a cashup',                         'cashup'),
  ('roster.view',        'View the roster',                         'roster'),
  ('roster.edit',        'Edit roster shifts',                      'roster'),
  ('staff.view',         'View staff list',                         'staff'),
  ('staff.edit',         'Edit staff details (not rate)',           'staff'),
  ('staff.rate.edit',    'Edit hourly rates / pay model',           'staff'),
  ('reports.view',       'View reports',                            'reports'),
  ('reports.export',     'Export CSV / PDF reports',                'reports'),
  ('settings.access',    'Access Settings section at all',          'settings'),
  ('settings.branches',  'Manage branches',                         'settings'),
  ('settings.brands',    'Manage brands',                           'settings'),
  ('settings.account',   'Edit account / tenant settings',          'settings'),
  ('team.view',          'View team members',                       'team'),
  ('team.manage',        'Create / edit / remove team members',     'team'),
  ('roles.manage',       'Create / edit custom roles & permissions','team'),
  ('tenant.admin',       'Meta — grants every permission',          'system')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category    = EXCLUDED.category;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Roles — per-tenant
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles (tenant_id);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select"
  ON public.roles FOR SELECT
  USING (tenant_id = (SELECT get_user_tenant_id()));

DROP POLICY IF EXISTS "roles_write_owner" ON public.roles;
CREATE POLICY "roles_write_owner"
  ON public.roles FOR ALL
  USING (tenant_id = (SELECT get_user_tenant_id()) AND get_user_role() = 'owner')
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()) AND get_user_role() = 'owner');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. role_permissions — m2m
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id        uuid NOT NULL REFERENCES public.roles(id)        ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
CREATE POLICY "role_permissions_select"
  ON public.role_permissions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.roles r
            WHERE r.id = role_permissions.role_id
              AND r.tenant_id = (SELECT get_user_tenant_id()))
  );

DROP POLICY IF EXISTS "role_permissions_write_owner" ON public.role_permissions;
CREATE POLICY "role_permissions_write_owner"
  ON public.role_permissions FOR ALL
  USING (
    get_user_role() = 'owner'
    AND EXISTS (SELECT 1 FROM public.roles r
                WHERE r.id = role_permissions.role_id
                  AND r.tenant_id = (SELECT get_user_tenant_id()))
  )
  WITH CHECK (
    get_user_role() = 'owner'
    AND EXISTS (SELECT 1 FROM public.roles r
                WHERE r.id = role_permissions.role_id
                  AND r.tenant_id = (SELECT get_user_tenant_id()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed system roles for every existing tenant + grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t RECORD;
  r_admin uuid;
  r_manager uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    -- Admin (full control). Idempotent via ON CONFLICT.
    INSERT INTO public.roles (tenant_id, name, description, is_system)
    VALUES (t.id, 'Admin', 'Full access to everything', true)
    ON CONFLICT (tenant_id, name) DO NOTHING;
    SELECT id INTO r_admin FROM public.roles
    WHERE tenant_id = t.id AND name = 'Admin';

    INSERT INTO public.roles (tenant_id, name, description, is_system)
    VALUES (t.id, 'Manager', 'Input data only — cannot edit settings or unlock cashups', true)
    ON CONFLICT (tenant_id, name) DO NOTHING;
    SELECT id INTO r_manager FROM public.roles
    WHERE tenant_id = t.id AND name = 'Manager';

    -- Admin = all permissions
    INSERT INTO public.role_permissions (role_id, permission_key)
      SELECT r_admin, key FROM public.permissions
    ON CONFLICT DO NOTHING;

    -- Manager = input-only subset
    INSERT INTO public.role_permissions (role_id, permission_key)
      SELECT r_manager, p.key FROM public.permissions p
      WHERE p.key IN (
        'cashup.view','cashup.edit','cashup.submit',
        'roster.view','roster.edit',
        'staff.view',
        'reports.view','reports.export',
        'team.view'
      )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. tenant_members.role_id  (alongside legacy text role)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_members_role ON public.tenant_members (role_id);

-- Backfill role_id from existing role text.
UPDATE public.tenant_members tm
SET role_id = r.id
FROM public.roles r
WHERE tm.role_id IS NULL
  AND r.tenant_id = tm.tenant_id
  AND (
    (tm.role = 'owner'   AND r.name = 'Admin') OR
    (tm.role = 'manager' AND r.name = 'Manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- is_owner() — single canonical check used by RLS / actions
CREATE OR REPLACE FUNCTION public.is_owner()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid() AND role = 'owner'
  );
$$;

-- has_permission(key) — true if user has explicit permission OR is owner
-- (owner always wins) OR has the tenant.admin meta-permission.
CREATE OR REPLACE FUNCTION public.has_permission(p_key text)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    is_owner()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.role_permissions rp ON rp.role_id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND (rp.permission_key = p_key OR rp.permission_key = 'tenant.admin')
    );
$$;

-- get_user_branch_ids() — list of branches the user can access.
-- For owners: returns NULL → caller treats as "all branches".
-- For others: returns tenant_members.branch_ids (empty array = no access).
CREATE OR REPLACE FUNCTION public.get_user_branch_ids()
  RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN is_owner() THEN NULL
    ELSE COALESCE(branch_ids, ARRAY[]::uuid[])
  END
  FROM public.tenant_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- can_access_branch(branch_id) — convenience wrapper.
-- Owners always true; others must have the branch in their branch_ids.
CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    is_owner()
    OR p_branch_id = ANY(COALESCE(
      (SELECT branch_ids FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1),
      ARRAY[]::uuid[]
    ));
$$;

COMMENT ON FUNCTION public.has_permission IS
  'Returns true if the current user is an owner OR has the permission via their role. Use in RLS / app gating instead of role = ''owner'' checks.';
COMMENT ON FUNCTION public.get_user_branch_ids IS
  'Branches accessible to the current user. NULL means "all" (owners). Empty array means "none".';
