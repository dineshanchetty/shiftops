-- RBAC enforcement: lock posted cashups + restrict admin tables to owners.
--
-- Roles (tenant_members.role):
--   • owner   — full control ("Admin Rights")
--   • manager — input data only; cannot unlock posted cashups; no rate edits
--
-- Defense in depth. The UI hides admin affordances from managers and server actions
-- check role before writing; this migration makes RLS the final gate.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. daily_cashups: managers cannot UPDATE/DELETE a row once it has been submitted.
-- ─────────────────────────────────────────────────────────────────────────────

-- Replace the catch-all "manage cashups" policy with a status-aware one.
DROP POLICY IF EXISTS "Owners and managers can manage cashups" ON public.daily_cashups;

CREATE POLICY "daily_cashups_insert_rbac"
  ON public.daily_cashups FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() IN ('owner', 'manager')
  );

CREATE POLICY "daily_cashups_update_rbac"
  ON public.daily_cashups FOR UPDATE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND (
      get_user_role() = 'owner'                 -- owners always
      OR (get_user_role() = 'manager' AND status IS DISTINCT FROM 'submitted')
    )
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND (
      get_user_role() = 'owner'
      OR (get_user_role() = 'manager' AND status IS DISTINCT FROM 'submitted')
    )
  );

CREATE POLICY "daily_cashups_delete_rbac"
  ON public.daily_cashups FOR DELETE
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() = 'owner'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cashup child tables: writes blocked when parent is submitted (managers).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cashup_is_editable(p_cashup_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    get_user_role() = 'owner'
    OR COALESCE(
      (SELECT status FROM public.daily_cashups WHERE id = p_cashup_id),
      'draft'
    ) IS DISTINCT FROM 'submitted';
$$;

COMMENT ON FUNCTION public.cashup_is_editable IS
  'True if the caller can write to rows belonging to the given cashup. Owners always; managers only while the parent cashup is in draft.';

-- Replace the existing "Access via cashup" ALL policy on each child table with
-- a stricter one that also respects the submitted lock.
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
    EXECUTE format('DROP POLICY IF EXISTS "Access via cashup" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   tbl || '_select_via_cashup', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   tbl || '_write_rbac', tbl);

    -- SELECT: anyone with tenant access to the parent cashup (RLS on daily_cashups already gates that)
    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.daily_cashups c
            WHERE c.id = %I.cashup_id
              AND c.tenant_id = (SELECT get_user_tenant_id())
          )
        )
    $f$, tbl || '_select_via_cashup', tbl, tbl);

    -- INSERT / UPDATE / DELETE: must pass cashup_is_editable
    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR INSERT
        WITH CHECK (cashup_is_editable(cashup_id))
    $f$, tbl || '_insert_rbac', tbl);

    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR UPDATE
        USING (cashup_is_editable(cashup_id))
        WITH CHECK (cashup_is_editable(cashup_id))
    $f$, tbl || '_update_rbac', tbl);

    EXECUTE format($f$
      CREATE POLICY %I
        ON public.%I FOR DELETE
        USING (cashup_is_editable(cashup_id))
    $f$, tbl || '_delete_rbac', tbl);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. staff_rates: tighten {owner, manager} → owner-only writes.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owners and managers manage staff rates" ON public.staff_rates;

CREATE POLICY "staff_rates_write_owner"
  ON public.staff_rates FOR ALL
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() = 'owner'
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() = 'owner'
  );
