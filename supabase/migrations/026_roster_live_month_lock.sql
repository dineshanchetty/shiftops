-- Lock roster edits for managers in the live month.
--
-- Problem: the roster grid never checked roster.edit, and RLS allowed any
-- owner/manager to write roster_entries for any date. Managers could adjust
-- the current (live) month's roster after the fact, shifting the hours budget
-- that cashup attendance is measured against.
--
-- Rule:
--   • Owner (Admin)              → can edit any date
--   • Role with roster.edit      → can only edit dates in FUTURE months
--                                   (planning ahead); the live month and the
--                                   past are locked
--   • No roster.edit             → no roster writes at all
--
-- SELECT stays as-is (branch-scoped, from migration 020).

CREATE OR REPLACE FUNCTION public.can_edit_roster_date(p_date date)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    is_owner()
    OR (
      has_permission('roster.edit')
      AND p_date >= (date_trunc('month', now()) + interval '1 month')::date
    );
$$;

COMMENT ON FUNCTION public.can_edit_roster_date IS
  'Owners edit any roster date. Other roles need roster.edit AND the date must fall in a future month — the live month is locked to prevent after-the-fact budget manipulation.';

DROP POLICY IF EXISTS "roster_entries_insert" ON public.roster_entries;
CREATE POLICY "roster_entries_insert"
  ON public.roster_entries FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND can_edit_roster_date(date)
  );

DROP POLICY IF EXISTS "roster_entries_update" ON public.roster_entries;
CREATE POLICY "roster_entries_update"
  ON public.roster_entries FOR UPDATE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND can_edit_roster_date(date)
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND can_edit_roster_date(date)
  );

DROP POLICY IF EXISTS "roster_entries_delete" ON public.roster_entries;
CREATE POLICY "roster_entries_delete"
  ON public.roster_entries FOR DELETE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND can_access_branch(branch_id)
    AND can_edit_roster_date(date)
  );
