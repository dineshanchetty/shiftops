-- Add historic / budget tracking fields to daily_cashups
-- These come from the franchisor's monthly turnover reports (Actual vs Budget vs Prev Yr).
-- Populated by scripts/import-historic.mjs.

ALTER TABLE daily_cashups ADD COLUMN IF NOT EXISTS budget_nett   NUMERIC(12,2);
ALTER TABLE daily_cashups ADD COLUMN IF NOT EXISTS budget_gross  NUMERIC(12,2);
ALTER TABLE daily_cashups ADD COLUMN IF NOT EXISTS prev_yr_to    NUMERIC(12,2);
ALTER TABLE daily_cashups ADD COLUMN IF NOT EXISTS growth_pct    NUMERIC(6,2);
ALTER TABLE daily_cashups ADD COLUMN IF NOT EXISTS data_source   TEXT;  -- 'historic_import' | 'aura_import' | 'manual'

COMMENT ON COLUMN daily_cashups.budget_nett   IS 'Budgeted nett turnover for this day (from franchisor monthly report)';
COMMENT ON COLUMN daily_cashups.budget_gross  IS 'Budgeted gross turnover for this day';
COMMENT ON COLUMN daily_cashups.prev_yr_to    IS 'Same-day previous-year actual nett turnover (for YoY comparison)';
COMMENT ON COLUMN daily_cashups.growth_pct    IS 'YoY growth % (Actual vs Prev Yr)';
COMMENT ON COLUMN daily_cashups.data_source   IS 'Origin of the row: historic_import | aura_import | manual';
