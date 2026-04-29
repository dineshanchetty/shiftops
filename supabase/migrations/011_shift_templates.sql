-- Shift templates per branch
-- Pre-defined named shifts (e.g. "Morning 06:00-14:00") so managers
-- can pick from a dropdown on the roster instead of editing times.

CREATE TABLE IF NOT EXISTS shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT shift_templates_unique_name_per_branch UNIQUE (branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_branch ON shift_templates(branch_id, is_active, sort_order);

-- RLS — same pattern as roster_entries (tenant + branch scoped)
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read shift templates"
  ON shift_templates FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND branch_id = ANY(get_user_branch_ids()));

CREATE POLICY "Owners and managers manage shift templates"
  ON shift_templates FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY(ARRAY['owner'::text, 'manager'::text]));

COMMENT ON TABLE shift_templates IS 'Reusable shift definitions per branch. Used as dropdown options on the roster.';
