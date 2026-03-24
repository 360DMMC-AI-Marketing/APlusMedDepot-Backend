-- 020_sprint3_prep.sql
-- Pre-Sprint 3 preparation: extend payments, commissions, and fix payment_status enum

-- Fix payments table for Sprint 3
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_event_id VARCHAR(255);

-- Fix commissions table - add order_id for efficient querying
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);

-- Fix payment_status constraint to use 'paid' instead of 'succeeded'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending','processing','paid','failed','refunded','partially_refunded'));
