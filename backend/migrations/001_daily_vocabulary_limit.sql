-- Existing reviews were already studied before this migration, so backfill
-- them to the previous database-local day instead of consuming today's quota.
BEGIN;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS first_studied_date DATE;

UPDATE reviews
SET first_studied_date = CURRENT_DATE - 1
WHERE first_studied_date IS NULL;

ALTER TABLE reviews
  ALTER COLUMN first_studied_date SET NOT NULL;

COMMIT;
