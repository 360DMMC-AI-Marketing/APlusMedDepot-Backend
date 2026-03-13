-- ============================================
-- MIGRATION: 031_performance_indexes.sql
-- Performance optimization: add missing indexes
-- for commission queries (order_id, status)
-- ============================================

-- commissions.order_id — used by calculateOrderCommissions, reverseOrderCommissions,
-- getCommissionsByOrder, and revenue queries in getSupplierOrderStats
CREATE INDEX IF NOT EXISTS idx_commissions_order_id ON commissions(order_id);

-- commissions.status — used by all commission queries that filter out 'reversed' status
-- (Note: existing idx_commissions_payout_status covers payout_status, not status)
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- Composite index for the most common commission query pattern:
-- WHERE supplier_id = ? AND status != 'reversed'
CREATE INDEX IF NOT EXISTS idx_commissions_supplier_status ON commissions(supplier_id, status);
