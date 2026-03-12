-- Add PayPal support fields to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT NULL;
-- Values: 'stripe', 'paypal', 'net30'
