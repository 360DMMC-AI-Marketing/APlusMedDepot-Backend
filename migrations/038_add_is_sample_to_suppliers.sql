-- 036_add_is_sample_to_suppliers.sql
-- Mark legacy/seeded supplier accounts as "sample" so orders containing their
-- products can be rejected at checkout. These accounts predate the real
-- vendor onboarding cutoff and exist only to populate the catalog for demos.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_suppliers_is_sample
  ON suppliers(is_sample)
  WHERE is_sample = true;

-- Backfill: any supplier created before the 2026-04-19 cutoff is a sample.
UPDATE suppliers
SET is_sample = true
WHERE created_at < '2026-04-19'::timestamptz
  AND is_sample = false;
