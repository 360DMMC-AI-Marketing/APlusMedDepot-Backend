CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR     UNIQUE NOT NULL,
  password_hash VARCHAR   NOT NULL,
  first_name  VARCHAR     NOT NULL,
  last_name   VARCHAR     NOT NULL,
  company_name VARCHAR,
  phone       VARCHAR,
  role        VARCHAR     NOT NULL CHECK (role IN ('customer', 'supplier', 'admin')),
  status      VARCHAR     NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
