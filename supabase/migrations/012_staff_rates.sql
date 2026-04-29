-- Staff hourly rates with effective-date history
-- Convention: only one row per staff has effective_to IS NULL (the active rate)

CREATE TABLE IF NOT EXISTS staff_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT staff_rates_unique_effective_from UNIQUE (staff_id, effective_from),
  CONSTRAINT staff_rates_valid_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_staff_rates_staff_dates ON staff_rates(staff_id, effective_from DESC);
-- Ensure only one "current" (effective_to IS NULL) row per staff
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_rates_one_current_per_staff
  ON staff_rates(staff_id) WHERE effective_to IS NULL;

-- Returns the rate effective on a given date (or NULL if none)
CREATE OR REPLACE FUNCTION get_staff_rate_at(p_staff_id UUID, p_date DATE)
RETURNS NUMERIC AS $$
  SELECT hourly_rate
  FROM staff_rates
  WHERE staff_id = p_staff_id
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- RLS — owners/managers manage; tenant members read
ALTER TABLE staff_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read staff rates"
  ON staff_rates FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Owners and managers manage staff rates"
  ON staff_rates FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY(ARRAY['owner'::text, 'manager'::text]));

COMMENT ON TABLE staff_rates IS 'Effective-dated hourly rate history per staff. Use get_staff_rate_at(staff_id, date) for lookups.';
