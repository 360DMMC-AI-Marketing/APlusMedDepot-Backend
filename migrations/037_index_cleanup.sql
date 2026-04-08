-- ============================================================
-- Migration 037: Index Cleanup
-- ============================================================
-- Fixes 1 WARN (duplicate index) and 5 INFO (unindexed foreign keys).
-- Does NOT drop unused indexes — site just launched, they need traffic
-- to register usage. Revisit after 30 days of production data.
-- ============================================================


-- ============================================================
-- 1. Drop duplicate index on commissions
-- ============================================================
-- Migration 013 renamed payout_status → status, but the old index
-- (idx_commissions_payout_status) still exists and now points to the
-- same column as idx_commissions_status. They are identical.

DROP INDEX IF EXISTS idx_commissions_payout_status;


-- ============================================================
-- 2. Add missing foreign key indexes
-- ============================================================
-- Foreign keys without covering indexes hurt DELETE/UPDATE performance
-- on the referenced table (PostgreSQL must scan the FK table to check
-- for dependent rows).

CREATE INDEX IF NOT EXISTS idx_cart_items_product_id
  ON cart_items(product_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by
  ON order_status_history(changed_by);

CREATE INDEX IF NOT EXISTS idx_products_reviewed_by
  ON products(reviewed_by);

CREATE INDEX IF NOT EXISTS idx_stock_audit_log_changed_by
  ON stock_audit_log(changed_by);

CREATE INDEX IF NOT EXISTS idx_suppliers_approved_by
  ON suppliers(approved_by);
