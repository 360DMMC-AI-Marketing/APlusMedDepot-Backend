-- User credit table for Net30 terms
CREATE TABLE IF NOT EXISTS user_credit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 50000.00,
  credit_used NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  eligible BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_credit_user_id ON user_credit(user_id);

ALTER TABLE user_credit ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_credit_service_all ON user_credit
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY user_credit_own_read ON user_credit
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Invoices table for Net30 order tracking
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_service_all ON invoices
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY invoices_own_read ON invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Ensure commission_rate default on suppliers table (15% standard rate)
ALTER TABLE suppliers ALTER COLUMN commission_rate SET DEFAULT 15.00;

-- Atomic credit deduction function (prevents race conditions)
CREATE OR REPLACE FUNCTION deduct_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE user_credit
  SET credit_used = credit_used + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND eligible = true
    AND (credit_limit - credit_used) >= p_amount;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

-- Atomic credit restore function (used on cancellation/refund)
CREATE OR REPLACE FUNCTION restore_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE user_credit
  SET credit_used = GREATEST(credit_used - p_amount, 0),
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
