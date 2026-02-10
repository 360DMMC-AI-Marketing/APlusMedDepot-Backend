CREATE TABLE commissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id     UUID        UNIQUE NOT NULL REFERENCES order_items(id),
  supplier_id       UUID        NOT NULL REFERENCES suppliers(id),
  sale_amount       DECIMAL(10,2) NOT NULL,
  commission_rate   DECIMAL(5,4) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  platform_amount   DECIMAL(10,2) NOT NULL,
  supplier_payout   DECIMAL(10,2) NOT NULL,
  payout_status     VARCHAR     NOT NULL DEFAULT 'pending' CHECK (payout_status IN (
    'pending',
    'processing',
    'paid',
    'failed'
  )),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
