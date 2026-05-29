-- Allow split shifts: drop the UNIQUE(branch_id, staff_id, date) index on
-- roster_entries so a single staff member can have multiple rows for one day
-- (e.g. 09:00-13:00 and 17:00-21:00).
--
-- The UI (DailyDetailPanel in calendar-grid.tsx) already creates one
-- roster_entries row per shift and aggregates per-staff totals on read.
-- The unique index was rejecting the second insert with 409 Conflict.

ALTER TABLE public.roster_entries
  DROP CONSTRAINT IF EXISTS roster_entries_branch_id_staff_id_date_key;

DROP INDEX IF EXISTS public.roster_entries_branch_id_staff_id_date_key;

-- Keep the non-unique lookup index for query performance.
CREATE INDEX IF NOT EXISTS idx_roster_branch_staff_date
  ON public.roster_entries (branch_id, staff_id, date);
