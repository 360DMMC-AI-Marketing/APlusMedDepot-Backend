-- ============================================
-- Migration 016: Create order_status_history table
-- ============================================
-- Tracks all order status transitions for audit trail.

CREATE TABLE order_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status   order_status NOT NULL,
  changed_by  UUID        NOT NULL REFERENCES users(id),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order_id
  ON order_status_history(order_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Customers can view status history for their own orders
CREATE POLICY order_status_history_customer_select ON order_status_history
  FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()::uuid)
  );

-- Suppliers can view status history for their sub-orders
CREATE POLICY order_status_history_supplier_select ON order_status_history
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE supplier_id = get_supplier_id()
    )
  );

-- Admins have full access
CREATE POLICY order_status_history_admin_all ON order_status_history
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
