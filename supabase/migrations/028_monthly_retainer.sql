-- Monthly retainer pay model for salaried staff (managers are not rostered
-- hourly — they're paid a fixed monthly amount).
--
-- staff_rates.pay_model (added in migration 017) gains 'monthly_retainer'.
-- For retainer rows, hourly_rate holds the MONTHLY amount (the column is a
-- generic unit rate interpreted by pay_model, per the 017 convention).

ALTER TABLE public.staff_rates
  DROP CONSTRAINT IF EXISTS staff_rates_pay_model_check;

ALTER TABLE public.staff_rates
  ADD CONSTRAINT staff_rates_pay_model_check
  CHECK (pay_model IN ('hourly', 'per_delivery', 'fixed_daily', 'monthly_retainer'));

COMMENT ON COLUMN public.staff_rates.pay_model IS
  'How the unit rate is applied. hourly — R/hr × hours. per_delivery — R × deliveries. fixed_daily — R per day worked. monthly_retainer — fixed R per month (pro-rated for partial payroll periods); retainer staff are excluded from hourly wage lines.';
