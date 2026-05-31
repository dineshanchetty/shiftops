-- Tenant-configurable default leave-day length.
-- Used by the roster panel when a manager selects "Paid Leave" and by the
-- payroll export when it backfills hours for a paid_leave row that has
-- shift_hours = NULL (older rows from before this column existed).
--
-- 9 hours matches the SA standard workday assumption used elsewhere.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_leave_hours numeric(4,2) NOT NULL DEFAULT 9;

COMMENT ON COLUMN public.tenants.default_leave_hours IS
  'Hours credited to a paid_leave / sick day when no explicit shift_hours is set. Editable in Settings → Account.';
