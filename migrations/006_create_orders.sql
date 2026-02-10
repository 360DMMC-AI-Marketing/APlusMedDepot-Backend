CREATE TABLE orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     VARCHAR     UNIQUE NOT NULL,
  customer_id      UUID        NOT NULL REFERENCES users(id),
  parent_order_id  UUID        REFERENCES orders(id),
  supplier_id      UUID        REFERENCES suppliers(id),
  total_amount     DECIMAL(10,2) NOT NULL,
  tax_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_address JSONB       NOT NULL,
  status           VARCHAR     NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment',
    'payment_processing',
    'payment_confirmed',
    'awaiting_fulfillment',
    'partially_shipped',
    'fully_shipped',
    'delivered',
    'cancelled',
    'refunded'
  )),
  payment_status   VARCHAR     NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded'
  )),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
