-- Defense-in-depth: enforce branch_id on data tables via RLS.
--
-- App layer already filters by user's branch_ids (sidebar / branch pickers /
-- dashboard scope helper). This migration adds the database-level guarantee
-- so a determined non-owner can't bypass the UI and read or write rows for
-- branches they weren't granted.
--
-- Rule:
--   • Owner   → can read & write every branch in the tenant (is_owner() shortcut)
--   • Other   → can only read & write rows whose branch_id ∈ get_user_branch_ids()
--
-- get_user_branch_ids() returns NULL for owners (treated as "all"); for
-- others it returns their branch_ids array (possibly empty = no access).

-- Helper used in policies: returns true if the caller can access the given
-- branch (owners always; everyone else must have it in their list).
-- can_access_branch() was created in migration 019; this just re-confirms.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_cashups: replace tenant-scope SELECT policies with branch-scoped ones
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owners see all cashups" ON public.daily_cashups;
DROP POLICY IF EXISTS "Managers see cashups in their branches" ON public.daily_cashups;
DROP POLICY IF EXISTS "daily_cashups_select_branch_scoped" ON public.daily_cashups;

CREATE POLICY "daily_cashups_select_branch_scoped"
  ON public.daily_cashups FOR SELECT
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
  );

-- INSERT / UPDATE / DELETE policies set by migration 015 already check
-- tenant + role. Extend their WITH CHECK to also enforce branch access.
DROP POLICY IF EXISTS "daily_cashups_insert_rbac" ON public.daily_cashups;
CREATE POLICY "daily_cashups_insert_rbac"
  ON public.daily_cashups FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() IN ('owner', 'manager')
    AND can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "daily_cashups_update_rbac" ON public.daily_cashups;
CREATE POLICY "daily_cashups_update_rbac"
  ON public.daily_cashups FOR UPDATE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND (
      get_user_role() = 'owner'
      OR (get_user_role() = 'manager' AND status IS DISTINCT FROM 'submitted')
    )
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND (
      get_user_role() = 'owner'
      OR (get_user_role() = 'manager' AND status IS DISTINCT FROM 'submitted')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- roster_entries: branch-scoped (was tenant-scoped)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop ALL existing policies on roster_entries (we don't know what was named what)
-- and rebuild with explicit branch-scoped ones.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roster_entries'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.roster_entries', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "roster_entries_select"
  ON public.roster_entries FOR SELECT
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
  );

CREATE POLICY "roster_entries_insert"
  ON public.roster_entries FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND get_user_role() IN ('owner', 'manager')
  );

CREATE POLICY "roster_entries_update"
  ON public.roster_entries FOR UPDATE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
  );

CREATE POLICY "roster_entries_delete"
  ON public.roster_entries FOR DELETE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
  );

COMMENT ON FUNCTION public.can_access_branch IS
  'True if the current user can read/write rows for the given branch. Owners always pass; non-owners must have the branch in tenant_members.branch_ids.';
