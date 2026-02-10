CREATE TABLE order_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id         UUID        NOT NULL REFERENCES products(id),
  supplier_id        UUID        NOT NULL REFERENCES suppliers(id),
  quantity           INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price         DECIMAL(10,2) NOT NULL,
  subtotal           DECIMAL(10,2) NOT NULL,
  fulfillment_status VARCHAR     NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN (
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
  )),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
