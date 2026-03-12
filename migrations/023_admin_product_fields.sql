-- ============================================================
-- Migration 023: Admin Product Fields
-- ============================================================
-- Adds is_featured column and indexes for admin product management.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
