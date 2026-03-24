CREATE TABLE products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name            VARCHAR     NOT NULL,
  description     TEXT,
  sku             VARCHAR     UNIQUE NOT NULL,
  price           DECIMAL(10,2) NOT NULL CHECK (price > 0),
  stock_quantity  INTEGER     NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  category        VARCHAR,
  status          VARCHAR     NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'active', 'inactive', 'out_of_stock')),
  images          JSONB       DEFAULT '[]',
  specifications  JSONB       DEFAULT '{}',
  weight          DECIMAL(8,2),
  dimensions      JSONB,
  is_deleted      BOOLEAN     DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
