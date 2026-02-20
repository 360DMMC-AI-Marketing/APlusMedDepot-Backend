-- ============================================================
-- Migration 018: Supplier Inventory Management
-- ============================================================
-- Adds columns, tables, and functions required by the supplier
-- inventory management API (Task 2.5).
-- ============================================================

-- ----------------------------------------------------------
-- 1. Add low_stock_threshold and last_restocked_at to products
-- ----------------------------------------------------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ;

-- ----------------------------------------------------------
-- 2. Create stock_audit_log table
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  old_quantity     INTEGER     NOT NULL,
  new_quantity     INTEGER     NOT NULL,
  change_source   VARCHAR(50) NOT NULL DEFAULT 'supplier_update'
                  CHECK (change_source IN ('supplier_update', 'bulk_update', 'order_decrement', 'order_refund')),
  changed_by      UUID        REFERENCES users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_audit_product_id ON stock_audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_audit_supplier_id ON stock_audit_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_audit_changed_at ON stock_audit_log(changed_at DESC);

-- RLS on stock_audit_log
ALTER TABLE stock_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_audit_supplier_select ON stock_audit_log
  FOR SELECT
  USING (supplier_id = get_supplier_id());

CREATE POLICY stock_audit_admin_all ON stock_audit_log
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----------------------------------------------------------
-- 3. Create lock_products_for_update RPC function
-- ----------------------------------------------------------
-- Used by inventory.ts for SELECT ... FOR UPDATE row locking.
-- Returns id and stock_quantity for the given product IDs.
-- MUST be called within a transaction context to hold locks.

CREATE OR REPLACE FUNCTION lock_products_for_update(product_ids UUID[])
RETURNS TABLE(id UUID, stock_quantity INTEGER) AS $$
  SELECT p.id, p.stock_quantity
  FROM products p
  WHERE p.id = ANY(product_ids)
  ORDER BY p.id   -- deterministic lock order prevents deadlocks
  FOR UPDATE;
$$ LANGUAGE sql;
