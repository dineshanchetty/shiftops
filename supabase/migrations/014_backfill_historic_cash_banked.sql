-- Backfill cash_banked for historic-imported daily_cashups rows.
-- The franchisor's monthly turnover PDFs only give us gross_turnover (no banking detail).
-- For reporting purposes we assume banking == turnover so variance reads as 0
-- on those days rather than a misleading huge variance.
-- Real cashups (data_source IS NULL or 'manual') are NOT touched.

UPDATE daily_cashups
SET cash_banked = gross_turnover
WHERE data_source = 'historic_import'
  AND gross_turnover IS NOT NULL
  AND gross_turnover > 0;
