CREATE TABLE suppliers (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name      VARCHAR     NOT NULL,
  tax_id             VARCHAR,
  business_type      VARCHAR,
  address            TEXT,
  phone              VARCHAR,
  commission_rate    DECIMAL(5,4) NOT NULL DEFAULT 0.1500 CHECK (commission_rate > 0 AND commission_rate <= 1),
  status             VARCHAR     NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
  banking_info       JSONB       DEFAULT '{}',
  product_categories TEXT[],
  documents          JSONB       DEFAULT '[]',
  years_in_business  INTEGER,
  approved_at        TIMESTAMPTZ,
  approved_by        UUID        REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
