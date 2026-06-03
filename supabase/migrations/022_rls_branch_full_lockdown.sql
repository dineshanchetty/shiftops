-- Defense-in-depth: branch-gate every remaining table a manager could reach.
-- Migration 020 covered daily_cashups + roster_entries. This one covers the
-- rest: staff (+ staff_rates), attendance, and all four cashup child tables.
--
-- Rule (same as 020): is_owner() always passes; non-owners must have the
-- relevant branch_id in tenant_members.branch_ids.

-- ─────────────────────────────────────────────────────────────────────────────
-- staff — non-owners only see staff whose branch_id is in their list OR who
-- are in staff_branches for one of their branches.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Managers see staff in their branches" ON public.staff;
DROP POLICY IF EXISTS "Owners see all staff" ON public.staff;
DROP POLICY IF EXISTS "Staff see themselves" ON public.staff;
DROP POLICY IF EXISTS "staff_select_branch_scoped" ON public.staff;

CREATE POLICY "staff_select_branch_scoped"
  ON public.staff FOR SELECT
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND (
      can_access_branch(branch_id)
      OR EXISTS (
        SELECT 1 FROM public.staff_branches sb
        WHERE sb.staff_id = staff.id
          AND can_access_branch(sb.branch_id)
      )
      OR auth_user_id = auth.uid()  -- staff seeing themselves
    )
  );

-- INSERT / UPDATE / DELETE were tightened to staff.edit in migration 021.
-- That policy already requires has_permission('staff.edit') which today only
-- owners hold; no extra branch check needed at write time.

-- ─────────────────────────────────────────────────────────────────────────────
-- staff_rates — SELECT scoped via the parent staff row's branch
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Tenant members read staff rates" ON public.staff_rates;
DROP POLICY IF EXISTS "staff_rates_select_branch_scoped" ON public.staff_rates;

CREATE POLICY "staff_rates_select_branch_scoped"
  ON public.staff_rates FOR SELECT
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_rates.staff_id
        AND (
          can_access_branch(s.branch_id)
          OR EXISTS (
            SELECT 1 FROM public.staff_branches sb
            WHERE sb.staff_id = s.id
              AND can_access_branch(sb.branch_id)
          )
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- attendance — scoped via the parent roster_entry's branch
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'attendance'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "attendance_select_branch_scoped"
  ON public.attendance FOR SELECT
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.roster_entries re
      WHERE re.id = attendance.roster_entry_id
        AND can_access_branch(re.branch_id)
    )
  );

CREATE POLICY "attendance_write_branch_scoped"
  ON public.attendance FOR ALL
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.roster_entries re
      WHERE re.id = attendance.roster_entry_id
        AND can_access_branch(re.branch_id)
    )
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.roster_entries re
      WHERE re.id = attendance.roster_entry_id
        AND can_access_branch(re.branch_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- cashup child tables — extend the existing SELECT policies with a branch
-- check via the parent cashup. cashup_is_editable (set in migration 015)
-- already gates writes for the submitted-lock; we layer branch on top.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'cashup_online_payments',
    'cashup_driver_entries',
    'cashup_expenses',
    'cashup_purchases'
  ]
  LOOP
    -- Replace SELECT policy with branch-aware version.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   tbl || '_select_via_cashup', tbl);
    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.daily_cashups c
            WHERE c.id = %I.cashup_id
              AND c.tenant_id = (SELECT get_user_tenant_id())
              AND can_access_branch(c.branch_id)
          )
        )
    $f$, tbl || '_select_via_cashup', tbl, tbl);

    -- Tighten the write policies: must be editable (existing rule) AND
    -- the parent cashup's branch must be in the caller's branches.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_rbac', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_rbac', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_rbac', tbl);

    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR INSERT
        WITH CHECK (
          cashup_is_editable(cashup_id)
          AND EXISTS (
            SELECT 1 FROM public.daily_cashups c
            WHERE c.id = %I.cashup_id
              AND can_access_branch(c.branch_id)
          )
        )
    $f$, tbl || '_insert_rbac', tbl, tbl);

    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR UPDATE
        USING (
          cashup_is_editable(cashup_id)
          AND EXISTS (
            SELECT 1 FROM public.daily_cashups c
            WHERE c.id = %I.cashup_id
              AND can_access_branch(c.branch_id)
          )
        )
        WITH CHECK (
          cashup_is_editable(cashup_id)
          AND EXISTS (
            SELECT 1 FROM public.daily_cashups c
            WHERE c.id = %I.cashup_id
              AND can_access_branch(c.branch_id)
          )
        )
    $f$, tbl || '_update_rbac', tbl, tbl, tbl);

    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR DELETE
        USING (
          cashup_is_editable(cashup_id)
          AND EXISTS (
            SELECT 1 FROM public.daily_cashups c
            WHERE c.id = %I.cashup_id
              AND can_access_branch(c.branch_id)
          )
        )
    $f$, tbl || '_delete_rbac', tbl, tbl);
  END LOOP;
END $$;
