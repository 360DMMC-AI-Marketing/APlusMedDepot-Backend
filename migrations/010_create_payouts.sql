CREATE TABLE payouts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID        NOT NULL REFERENCES suppliers(id),
  amount           DECIMAL(10,2) NOT NULL,
  commission_total DECIMAL(10,2) NOT NULL,
  period_start     DATE        NOT NULL,
  period_end       DATE        NOT NULL,
  payout_date      DATE,
  status           VARCHAR     NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed'
  )),
  is_early_payout    BOOLEAN     DEFAULT false,
  early_payout_fee   DECIMAL(10,2) DEFAULT 0,
  transaction_ref    VARCHAR,
  invoice_url        VARCHAR,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
