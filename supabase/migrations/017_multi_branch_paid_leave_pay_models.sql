-- Three related changes for the Reitz payroll go-live:
--
-- 1. staff_branches (m2m) — staff (especially drivers in shared delivery
--    pools like Deliveree) can work at multiple branches. The primary
--    home branch stays on staff.branch_id; additional branches go here.
--
-- 2. roster_entries.leave_type — split unpaid "Off" from paid "Leave".
--    Until now is_off=true meant both. Going forward:
--      • leave_type IS NULL                → working day (uses shift_*)
--      • leave_type = 'off'                → unpaid scheduled off
--      • leave_type = 'paid_leave'         → paid annual / personal leave
--      • leave_type = 'sick'               → paid sick leave (future)
--      • leave_type = 'public_holiday'     → public holiday (future)
--    Paid types still set is_off=true (no shift_start/end) but their
--    shift_hours count toward payroll.
--
-- 3. staff_rates.pay_model — drivers can be paid hourly, per-delivery,
--    or as a fixed daily rate. The existing `hourly_rate` column is
--    reinterpreted as a unit rate based on pay_model.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. staff_branches
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_branches (
  staff_id   uuid NOT NULL REFERENCES public.staff(id)    ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_branches_branch ON public.staff_branches (branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_branches_tenant ON public.staff_branches (tenant_id);

-- Backfill: every staff member with a primary branch_id becomes a member of
-- that one branch in the m2m table. Additional branches are added via the UI.
INSERT INTO public.staff_branches (staff_id, branch_id, tenant_id)
SELECT id, branch_id, tenant_id
FROM public.staff
WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.staff_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_branches_select"
  ON public.staff_branches FOR SELECT
  USING (tenant_id = (SELECT get_user_tenant_id()));

CREATE POLICY "staff_branches_write_owner"
  ON public.staff_branches FOR ALL
  USING (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() = 'owner'
  )
  WITH CHECK (
    tenant_id = (SELECT get_user_tenant_id())
    AND get_user_role() = 'owner'
  );

COMMENT ON TABLE public.staff_branches IS
  'Many-to-many: staff who work at multiple branches (e.g. shared driver pools). The primary branch is still on staff.branch_id and is auto-mirrored here on save.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. leave_type
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.roster_entries
  ADD COLUMN IF NOT EXISTS leave_type text
    CHECK (leave_type IN ('off', 'paid_leave', 'sick', 'public_holiday'));

-- Backfill existing is_off=true rows as plain unpaid "off"
UPDATE public.roster_entries
SET leave_type = 'off'
WHERE is_off = true AND leave_type IS NULL;

COMMENT ON COLUMN public.roster_entries.leave_type IS
  'Classifies an is_off row. NULL = working day. ''off'' = unpaid scheduled off. ''paid_leave''/''sick''/''public_holiday'' count toward payroll hours.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pay_model on staff_rates
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.staff_rates
  ADD COLUMN IF NOT EXISTS pay_model text
    NOT NULL DEFAULT 'hourly'
    CHECK (pay_model IN ('hourly', 'per_delivery', 'fixed_daily'));

COMMENT ON COLUMN public.staff_rates.hourly_rate IS
  'Unit rate. Interpretation depends on pay_model: hourly = R/hr, per_delivery = R/delivery, fixed_daily = R/day worked.';
COMMENT ON COLUMN public.staff_rates.pay_model IS
  'How this rate is applied. hourly (default) — multiplied by hours worked. per_delivery — multiplied by delivery_count. fixed_daily — paid the full unit_rate for any day with hours > 0.';
