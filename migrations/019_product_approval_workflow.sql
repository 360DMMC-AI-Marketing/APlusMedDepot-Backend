-- ============================================================
-- Migration 019: Product Approval Workflow
-- ============================================================
-- Adds admin review metadata columns to products table for the
-- approval workflow (Task 2.6).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_feedback TEXT;

CREATE INDEX IF NOT EXISTS idx_products_status_created ON products(status, created_at ASC);
