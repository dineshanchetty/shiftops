-- Lock staff CRUD to users with the staff.edit permission (owners by default).
-- SELECT stays open to all tenant members (managers need to see the staff list
-- to roster them); only INSERT / UPDATE / DELETE tighten.

DROP POLICY IF EXISTS "Owners and managers can manage staff" ON public.staff;

CREATE POLICY "staff_write_admin_only"
  ON public.staff FOR ALL
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND has_permission('staff.edit')
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND has_permission('staff.edit')
  );
