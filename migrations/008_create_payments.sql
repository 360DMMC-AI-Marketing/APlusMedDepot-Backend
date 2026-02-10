CREATE TABLE payments (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID        NOT NULL REFERENCES orders(id),
  stripe_payment_intent_id VARCHAR     UNIQUE NOT NULL,
  amount                   DECIMAL(10,2) NOT NULL,
  currency                 VARCHAR     NOT NULL DEFAULT 'usd',
  status                   VARCHAR     NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded'
  )),
  stripe_charge_id         VARCHAR,
  failure_reason           TEXT,
  metadata                 JSONB       DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
