-- Attendance tracking linked to roster entries
-- Run this migration after deploying the attendance UI feature

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  roster_entry_id uuid NOT NULL REFERENCES public.roster_entries(id) ON DELETE CASCADE,
  actual_start time,
  actual_end time,
  actual_hours numeric(4,2),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'absent', 'late')),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(roster_entry_id)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see attendance for their own tenant
CREATE POLICY "attendance_select_tenant"
  ON public.attendance FOR SELECT
  USING (tenant_id = (SELECT get_user_tenant_id()));

-- RLS: Users can insert attendance for their own tenant
CREATE POLICY "attendance_insert_tenant"
  ON public.attendance FOR INSERT
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

-- RLS: Users can update attendance for their own tenant
CREATE POLICY "attendance_update_tenant"
  ON public.attendance FOR UPDATE
  USING (tenant_id = (SELECT get_user_tenant_id()));

-- RLS: Users can delete attendance for their own tenant
CREATE POLICY "attendance_delete_tenant"
  ON public.attendance FOR DELETE
  USING (tenant_id = (SELECT get_user_tenant_id()));

-- Index for fast lookups by roster entry
CREATE INDEX idx_attendance_roster_entry ON public.attendance(roster_entry_id);

-- Index for tenant scoped queries
CREATE INDEX idx_attendance_tenant ON public.attendance(tenant_id);
