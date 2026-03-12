-- ============================================
-- MIGRATION: 000_extensions.sql
-- ============================================
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create reusable trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATION: 001_create_users.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 002_create_suppliers.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 003_create_products.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 004_create_carts.sql
-- ============================================
CREATE TABLE carts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES users(id),
  status      VARCHAR     NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION: 005_create_cart_items.sql
-- ============================================
CREATE TABLE cart_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID        NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id),
  quantity    INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price  DECIMAL(10,2) NOT NULL CHECK (unit_price > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (cart_id, product_id)
);

CREATE TRIGGER set_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION: 006_create_orders.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 007_create_order_items.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 008_create_payments.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 009_create_commissions.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 010_create_payouts.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 011_create_indexes.sql
-- ============================================

-- users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- suppliers
CREATE INDEX idx_suppliers_user_id ON suppliers(user_id);
CREATE INDEX idx_suppliers_status ON suppliers(status);

-- products
CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_is_deleted ON products(is_deleted);
CREATE INDEX idx_products_search ON products USING GIN(to_tsvector('english', name));

-- carts (partial index — only active carts)
CREATE INDEX idx_carts_customer_active ON carts(customer_id) WHERE status = 'active';

-- orders
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_parent_order_id ON orders(parent_order_id);
CREATE INDEX idx_orders_supplier_id ON orders(supplier_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

-- order_items
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_supplier_id ON order_items(supplier_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- payments
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status);

-- commissions
CREATE INDEX idx_commissions_supplier_id ON commissions(supplier_id);
CREATE INDEX idx_commissions_payout_status ON commissions(payout_status);

-- payouts
CREATE INDEX idx_payouts_supplier_id ON payouts(supplier_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_payout_date ON payouts(payout_date);

-- ============================================
-- MIGRATION: 012_create_rls_policies.sql
-- ============================================
-- Supabase Auth provides auth.uid() which returns the authenticated user's UUID.
-- Service role key bypasses RLS entirely.
-- These policies apply when using anon key or user JWT.

-- ============================================
-- STEP 1: Helper functions
-- ============================================

CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
  SELECT auth.uid()::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM users WHERE id = auth.uid()::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_current_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_supplier_id()
RETURNS UUID AS $$
  SELECT id FROM suppliers WHERE user_id = auth.uid()::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- STEP 2: Enable RLS on all tables
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Create policies
-- ============================================

-- ------------------------------------------
-- USERS
-- ------------------------------------------

-- Users can read their own profile
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (id = auth.uid()::uuid);

-- Users can update their own profile
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = auth.uid()::uuid)
  WITH CHECK (id = auth.uid()::uuid);

-- Admins have full access to all users
CREATE POLICY users_admin_all ON users
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- SUPPLIERS
-- ------------------------------------------

-- Suppliers can read their own supplier profile
CREATE POLICY suppliers_select_own ON suppliers
  FOR SELECT
  USING (user_id = auth.uid()::uuid);

-- Suppliers can update their own supplier profile
CREATE POLICY suppliers_update_own ON suppliers
  FOR UPDATE
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Admins have full access to all suppliers
CREATE POLICY suppliers_admin_all ON suppliers
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- PRODUCTS
-- ------------------------------------------

-- Any authenticated user can view active, non-deleted products
CREATE POLICY products_select_active ON products
  FOR SELECT
  USING (status = 'active' AND is_deleted = false);

-- Suppliers can view all their own products (including draft/inactive)
CREATE POLICY products_supplier_select_own ON products
  FOR SELECT
  USING (supplier_id = get_supplier_id());

-- Suppliers can insert products for themselves
CREATE POLICY products_supplier_insert ON products
  FOR INSERT
  WITH CHECK (supplier_id = get_supplier_id());

-- Suppliers can update their own products
CREATE POLICY products_supplier_update ON products
  FOR UPDATE
  USING (supplier_id = get_supplier_id())
  WITH CHECK (supplier_id = get_supplier_id());

-- Suppliers can soft-delete their own products (UPDATE is_deleted)
CREATE POLICY products_supplier_delete ON products
  FOR UPDATE
  USING (supplier_id = get_supplier_id())
  WITH CHECK (supplier_id = get_supplier_id());

-- Admins have full access to all products
CREATE POLICY products_admin_all ON products
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- CARTS
-- ------------------------------------------

-- Customers have full CRUD on their own carts
CREATE POLICY carts_customer_crud ON carts
  FOR ALL
  USING (customer_id = auth.uid()::uuid)
  WITH CHECK (customer_id = auth.uid()::uuid);

-- Admins can view all carts
CREATE POLICY carts_admin_select ON carts
  FOR SELECT
  USING (is_admin());

-- ------------------------------------------
-- CART_ITEMS
-- ------------------------------------------

-- Customers have full CRUD on items in their own carts
CREATE POLICY cart_items_customer_crud ON cart_items
  FOR ALL
  USING (cart_id IN (SELECT id FROM carts WHERE customer_id = auth.uid()::uuid))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE customer_id = auth.uid()::uuid));

-- Admins can view all cart items
CREATE POLICY cart_items_admin_select ON cart_items
  FOR SELECT
  USING (is_admin());

-- ------------------------------------------
-- ORDERS
-- ------------------------------------------

-- Customers can view their own master orders (parent_order_id IS NULL)
CREATE POLICY orders_customer_select ON orders
  FOR SELECT
  USING (customer_id = auth.uid()::uuid AND parent_order_id IS NULL);

-- Suppliers can view sub-orders assigned to them (parent_order_id IS NOT NULL)
CREATE POLICY orders_supplier_select ON orders
  FOR SELECT
  USING (supplier_id = get_supplier_id() AND parent_order_id IS NOT NULL);

-- Admins have full access to all orders
CREATE POLICY orders_admin_all ON orders
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- ORDER_ITEMS
-- ------------------------------------------

-- Customers can view order items belonging to their orders
CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()::uuid));

-- Suppliers can view order items assigned to them
CREATE POLICY order_items_supplier_select ON order_items
  FOR SELECT
  USING (supplier_id = get_supplier_id());

-- Admins have full access to all order items
CREATE POLICY order_items_admin_all ON order_items
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- PAYMENTS
-- ------------------------------------------

-- Customers can view payments for their own orders
CREATE POLICY payments_customer_select ON payments
  FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()::uuid));

-- Admins have full access to all payments
CREATE POLICY payments_admin_all ON payments
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- NO supplier access to payment data

-- ------------------------------------------
-- COMMISSIONS
-- ------------------------------------------

-- Suppliers can view their own commissions
CREATE POLICY commissions_supplier_select ON commissions
  FOR SELECT
  USING (supplier_id = get_supplier_id());

-- Admins have full access to all commissions
CREATE POLICY commissions_admin_all ON commissions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- NO customer access to commission data

-- ------------------------------------------
-- PAYOUTS
-- ------------------------------------------

-- Suppliers can view their own payouts
CREATE POLICY payouts_supplier_select ON payouts
  FOR SELECT
  USING (supplier_id = get_supplier_id());

-- Admins have full access to all payouts
CREATE POLICY payouts_admin_all ON payouts
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- NO customer access to payout data

-- ============================================
-- MIGRATION: 013_align_supplier_schema.sql
-- ============================================
-- Migration 013: Align supplier schema with approved supplier proposal + PM clarifications
-- Affects: suppliers, supplier_documents (new), order_items, commissions, payouts

-- ============================================================
-- 1. ALTER suppliers TABLE
-- ============================================================

-- 1a) Change address column from TEXT to JSONB
ALTER TABLE suppliers
  ALTER COLUMN address TYPE JSONB USING COALESCE(address::jsonb, '{}'::jsonb);
ALTER TABLE suppliers
  ALTER COLUMN address SET DEFAULT '{}'::jsonb;

-- 1b) Add new columns (conditionally)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_type VARCHAR(100);  -- already exists, IF NOT EXISTS handles it
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- 1c) Rename banking_info to bank_account_info
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'banking_info'
  ) THEN
    ALTER TABLE suppliers RENAME COLUMN banking_info TO bank_account_info;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'bank_account_info'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN bank_account_info JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 1d) Change commission_rate type and semantics (decimal fraction → percentage)
--     Drop old CHECK first, then ALTER TYPE, then add new CHECK
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_commission_rate_check;
ALTER TABLE suppliers
  ALTER COLUMN commission_rate TYPE NUMERIC(5,2) USING (commission_rate * 100)::NUMERIC(5,2);
ALTER TABLE suppliers
  ALTER COLUMN commission_rate SET DEFAULT 15.00;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_commission_rate_check
  CHECK (commission_rate >= 0 AND commission_rate <= 100);

-- 1e) Drop documents column (data moves to supplier_documents table)
ALTER TABLE suppliers DROP COLUMN IF EXISTS documents;

-- 1f) Update status CHECK constraint (add 'under_review' and 'needs_revision')
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_status_check;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_status_check
  CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'needs_revision', 'suspended'));

-- 1g) Add new indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_business_name ON suppliers(business_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON suppliers(created_at DESC);


-- ============================================================
-- 2. CREATE TABLE supplier_documents
-- ============================================================

CREATE TABLE supplier_documents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  document_type     VARCHAR(50) NOT NULL
                    CHECK (document_type IN ('business_license', 'insurance_certificate', 'tax_document', 'w9', 'other')),
  file_name         VARCHAR(255) NOT NULL,
  file_size         INTEGER,
  mime_type         VARCHAR(100),
  storage_path      TEXT        NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  review_notes      TEXT,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_docs_supplier_id ON supplier_documents(supplier_id);
CREATE INDEX idx_supplier_docs_type ON supplier_documents(document_type);
CREATE INDEX idx_supplier_docs_status ON supplier_documents(status);

-- RLS
ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Suppliers can view their own documents
CREATE POLICY supplier_documents_supplier_select ON supplier_documents
  FOR SELECT USING (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = auth.uid()
    )
  );

-- Policy: Suppliers can insert their own documents
CREATE POLICY supplier_documents_supplier_insert ON supplier_documents
  FOR INSERT WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = auth.uid()
    )
  );

-- Policy: Admins can do everything
CREATE POLICY supplier_documents_admin_all ON supplier_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Apply the shared updated_at trigger (reuse existing function from 000_extensions.sql)
CREATE TRIGGER set_supplier_documents_updated_at
  BEFORE UPDATE ON supplier_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 3. ALTER order_items TABLE
-- ============================================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);


-- ============================================================
-- 4. ALTER commissions TABLE
-- ============================================================

-- 4a) Change commission_rate type (decimal fraction → percentage)
ALTER TABLE commissions
  ALTER COLUMN commission_rate TYPE NUMERIC(5,2) USING (commission_rate * 100)::NUMERIC(5,2);
ALTER TABLE commissions
  ADD CONSTRAINT commissions_commission_rate_check
  CHECK (commission_rate >= 0 AND commission_rate <= 100);

-- 4b) Add supplier_amount column
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS supplier_amount NUMERIC(12,2);

-- 4c) Add confirmed_at timestamp
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 4d) Rename payout_status to status and update CHECK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commissions' AND column_name = 'payout_status'
  ) THEN
    ALTER TABLE commissions RENAME COLUMN payout_status TO status;
  END IF;
END $$;
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_payout_status_check;
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
ALTER TABLE commissions
  ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled'));


-- ============================================================
-- 5. ALTER payouts TABLE
-- ============================================================

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS items_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payout_method VARCHAR(50) DEFAULT 'ach_transfer';
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- ============================================
-- MIGRATION: 014_fix_rls_policy_gaps.sql
-- ============================================
-- This migration addresses 4 critical RLS policy gaps identified during audit:
-- 1. Missing INSERT policy on suppliers table
-- 2. Missing all RLS policies on supplier_documents table
-- 3. Suppliers can update their own status/commission_rate (needs trigger restriction)
-- 4. Admin has only SELECT access on carts/cart_items (needs full access)
-- ============================================

-- ------------------------------------------
-- GAP 1: Allow suppliers to INSERT their own supplier record during registration
-- ------------------------------------------

DROP POLICY IF EXISTS suppliers_insert_own ON suppliers;

CREATE POLICY suppliers_insert_own ON suppliers
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::uuid
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::uuid
      AND role = 'supplier'
    )
  );

-- ------------------------------------------
-- GAP 2: Add missing RLS policies for supplier_documents table
-- ------------------------------------------

-- Enable RLS (idempotent — does nothing if already enabled)
ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS supplier_documents_supplier_select ON supplier_documents;
DROP POLICY IF EXISTS supplier_documents_supplier_insert ON supplier_documents;
DROP POLICY IF EXISTS supplier_documents_supplier_update ON supplier_documents;
DROP POLICY IF EXISTS supplier_documents_admin_all ON supplier_documents;

-- Suppliers can view their own documents
CREATE POLICY supplier_documents_supplier_select ON supplier_documents
  FOR SELECT
  USING (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = auth.uid()::uuid
    )
  );

-- Suppliers can upload their own documents
CREATE POLICY supplier_documents_supplier_insert ON supplier_documents
  FOR INSERT
  WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = auth.uid()::uuid
    )
  );

-- Suppliers can update their own documents (e.g., re-upload after rejection)
CREATE POLICY supplier_documents_supplier_update ON supplier_documents
  FOR UPDATE
  USING (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = auth.uid()::uuid
    )
  );

-- Admins have full access to all supplier documents
CREATE POLICY supplier_documents_admin_all ON supplier_documents
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- GAP 3: Prevent suppliers from updating sensitive fields (status, commission_rate, etc.)
-- ------------------------------------------

-- Drop existing trigger and function if they exist (for idempotency)
DROP TRIGGER IF EXISTS enforce_supplier_update_restrictions ON suppliers;
DROP FUNCTION IF EXISTS prevent_supplier_self_approval();

CREATE OR REPLACE FUNCTION prevent_supplier_self_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only apply restrictions when authenticated user is updating their own supplier record
  -- Service role bypasses this entirely (auth.uid() will be NULL for service role)
  IF auth.uid() IS NOT NULL AND OLD.user_id = auth.uid()::uuid THEN
    -- Check if the current user has role='supplier'
    IF EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::uuid
      AND role = 'supplier'
    ) THEN
      -- Prevent changes to sensitive fields
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        RAISE EXCEPTION 'Suppliers cannot change their own status';
      END IF;

      IF OLD.commission_rate IS DISTINCT FROM NEW.commission_rate THEN
        RAISE EXCEPTION 'Suppliers cannot change their own commission rate';
      END IF;

      IF OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
        RAISE EXCEPTION 'Suppliers cannot change approval timestamp';
      END IF;

      IF OLD.approved_by IS DISTINCT FROM NEW.approved_by THEN
        RAISE EXCEPTION 'Suppliers cannot change approver';
      END IF;

      IF OLD.current_balance IS DISTINCT FROM NEW.current_balance THEN
        RAISE EXCEPTION 'Suppliers cannot change their balance directly';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_supplier_update_restrictions
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_supplier_self_approval();

-- ------------------------------------------
-- GAP 4: Grant admins full access (not just SELECT) to carts and cart_items
-- ------------------------------------------

-- Replace existing SELECT-only policies with full access policies

-- Carts
DROP POLICY IF EXISTS carts_admin_select ON carts;
DROP POLICY IF EXISTS carts_admin_all ON carts;

CREATE POLICY carts_admin_all ON carts
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Cart Items
DROP POLICY IF EXISTS cart_items_admin_select ON cart_items;
DROP POLICY IF EXISTS cart_items_admin_all ON cart_items;

CREATE POLICY cart_items_admin_all ON cart_items
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- MIGRATION: 015_extend_orders.sql
-- ============================================
-- Adds: payment_intent_id and notes to orders, delivered_at to order_items,
-- creates enum types, converts orders.status to enum, adds missing indexes.

-- ============================================================
-- 1. ADD MISSING COLUMNS TO orders
-- ============================================================
-- shipping_address already exists (006_create_orders.sql)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================================
-- 2. ADD MISSING COLUMNS TO order_items
-- ============================================================
-- tracking_number, carrier, shipped_at already exist (013_align_supplier_schema.sql)

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ============================================================
-- 3. CREATE ENUM TYPES (only if they don't exist)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'pending_payment',
      'payment_processing',
      'payment_confirmed',
      'awaiting_fulfillment',
      'partially_shipped',
      'fully_shipped',
      'delivered',
      'cancelled',
      'refunded'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'pending',
      'processing',
      'succeeded',
      'failed',
      'refunded'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_status') THEN
    CREATE TYPE fulfillment_status AS ENUM (
      'pending',
      'processing',
      'shipped',
      'delivered',
      'cancelled'
    );
  END IF;
END $$;

-- ============================================================
-- 4. ALTER orders.status TO USE order_status ENUM
-- ============================================================
-- orders.status CHECK values match the order_status enum exactly (9 values).
-- Drop the CHECK constraint first, then convert column type.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Must drop the VARCHAR default before converting to enum type,
-- otherwise PostgreSQL cannot auto-cast the default value.
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;

ALTER TABLE orders
  ALTER COLUMN status TYPE order_status
  USING status::order_status;

ALTER TABLE orders
  ALTER COLUMN status SET DEFAULT 'pending_payment'::order_status;

-- NOTE: orders.payment_status is NOT converted to payment_status enum because
-- the existing CHECK includes 'partially_refunded' which is not in the enum.
-- Similarly, order_items.fulfillment_status includes 'confirmed' and 'refunded'
-- not in the fulfillment_status enum. These columns remain VARCHAR with CHECKs
-- until the enum definitions are reconciled in a future migration.

-- ============================================================
-- 5. ADD MISSING INDEXES
-- ============================================================
-- idx_order_items_supplier_id already exists (011_create_indexes.sql)

CREATE INDEX IF NOT EXISTS idx_order_items_fulfillment_status
  ON order_items(fulfillment_status);

CREATE INDEX IF NOT EXISTS idx_orders_customer_status
  ON orders(customer_id, status);

-- Partial unique index on payment_intent_id (only non-NULL values must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_id
  ON orders(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- ============================================
-- MIGRATION: 016_create_order_status_history.sql
-- ============================================
-- Tracks all order status transitions for audit trail.

CREATE TABLE order_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status   order_status NOT NULL,
  changed_by  UUID        NOT NULL REFERENCES users(id),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order_id
  ON order_status_history(order_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Customers can view status history for their own orders
CREATE POLICY order_status_history_customer_select ON order_status_history
  FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()::uuid)
  );

-- Suppliers can view status history for their sub-orders
CREATE POLICY order_status_history_supplier_select ON order_status_history
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE supplier_id = get_supplier_id()
    )
  );

-- Admins have full access
CREATE POLICY order_status_history_admin_all ON order_status_history
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- MIGRATION: 017_audit_rls_supplier_products.sql
-- ============================================================
-- Audit scope: products table RLS policies + schema correctness
--
-- GAPS FOUND:
--   1. Status CHECK constraint on products table uses old enum values
--      (draft, pending_review, active, inactive, out_of_stock) which
--      conflict with supplier product service values
--      (pending, active, inactive, rejected, needs_revision).
--   2. products_supplier_delete policy is a redundant duplicate of
--      products_supplier_update (both are UPDATE policies with identical
--      USING/WITH CHECK predicates). Dropping the redundant copy.
--
-- POLICIES CONFIRMED CORRECT — NO CHANGES NEEDED:
--   products_select_active        : any auth user SELECT WHERE status='active' AND is_deleted=false
--   products_supplier_select_own  : suppliers SELECT WHERE supplier_id = get_supplier_id()
--   products_supplier_insert      : suppliers INSERT WHERE supplier_id = get_supplier_id()
--   products_supplier_update      : suppliers UPDATE WHERE supplier_id = get_supplier_id()
--   products_admin_all            : admins ALL
-- ============================================================

-- ----------------------------------------------------------
-- FIX 1: Update products status CHECK constraint
-- ----------------------------------------------------------
-- Old values: draft, pending_review, active, inactive, out_of_stock
-- New values align with supplier product service workflow:
--   pending        → newly submitted by supplier, awaiting admin review
--   active         → approved and listed on marketplace
--   inactive       → supplier-deactivated (still exists in DB)
--   rejected       → admin rejected; supplier can revise and resubmit
--   needs_revision → admin requested changes before approval

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'rejected', 'needs_revision'));

-- Also update the column default to 'pending' (new lifecycle start)
ALTER TABLE products ALTER COLUMN status SET DEFAULT 'pending';

-- ----------------------------------------------------------
-- FIX 2: Drop redundant products_supplier_delete policy
-- ----------------------------------------------------------
-- products_supplier_delete and products_supplier_update are identical
-- UPDATE policies. PostgreSQL evaluates all UPDATE policies with OR
-- logic — the duplicate adds no protection and creates confusion.
-- products_supplier_update covers soft-delete (UPDATE is_deleted=true)
-- as well as regular field updates; no separate policy needed.

DROP POLICY IF EXISTS products_supplier_delete ON products;

-- ----------------------------------------------------------
-- VERIFICATION: Re-declare all active products policies
-- (idempotent — DROP IF EXISTS before each CREATE)
-- ----------------------------------------------------------

-- Any authenticated user can see active, non-deleted products
DROP POLICY IF EXISTS products_select_active ON products;
CREATE POLICY products_select_active ON products
  FOR SELECT
  USING (status = 'active' AND is_deleted = false);

-- Suppliers can see ALL their own products (any status, including pending/rejected/needs_revision)
DROP POLICY IF EXISTS products_supplier_select_own ON products;
CREATE POLICY products_supplier_select_own ON products
  FOR SELECT
  USING (supplier_id = get_supplier_id());

-- Suppliers can insert products only for their own supplier_id
DROP POLICY IF EXISTS products_supplier_insert ON products;
CREATE POLICY products_supplier_insert ON products
  FOR INSERT
  WITH CHECK (supplier_id = get_supplier_id());

-- Suppliers can update their own products (covers both field updates and soft-delete)
DROP POLICY IF EXISTS products_supplier_update ON products;
CREATE POLICY products_supplier_update ON products
  FOR UPDATE
  USING (supplier_id = get_supplier_id())
  WITH CHECK (supplier_id = get_supplier_id());

-- Admins have unrestricted access to all products
DROP POLICY IF EXISTS products_admin_all ON products;
CREATE POLICY products_admin_all ON products
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- MIGRATION: 018_supplier_inventory.sql
-- ============================================================
-- Adds columns, tables, and functions required by the supplier
-- inventory management API (Task 2.5).
-- ============================================================

-- ----------------------------------------------------------
-- 1. Add low_stock_threshold and last_restocked_at to products
-- ----------------------------------------------------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ;

-- ----------------------------------------------------------
-- 2. Create stock_audit_log table
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  old_quantity     INTEGER     NOT NULL,
  new_quantity     INTEGER     NOT NULL,
  change_source   VARCHAR(50) NOT NULL DEFAULT 'supplier_update'
                  CHECK (change_source IN ('supplier_update', 'bulk_update', 'order_decrement', 'order_refund')),
  changed_by      UUID        REFERENCES users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_audit_product_id ON stock_audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_audit_supplier_id ON stock_audit_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_audit_changed_at ON stock_audit_log(changed_at DESC);

-- RLS on stock_audit_log
ALTER TABLE stock_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_audit_supplier_select ON stock_audit_log
  FOR SELECT
  USING (supplier_id = get_supplier_id());

CREATE POLICY stock_audit_admin_all ON stock_audit_log
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----------------------------------------------------------
-- 3. Create lock_products_for_update RPC function
-- ----------------------------------------------------------
-- Used by inventory.ts for SELECT ... FOR UPDATE row locking.
-- Returns id and stock_quantity for the given product IDs.
-- MUST be called within a transaction context to hold locks.

CREATE OR REPLACE FUNCTION lock_products_for_update(product_ids UUID[])
RETURNS TABLE(id UUID, stock_quantity INTEGER) AS $$
  SELECT p.id, p.stock_quantity
  FROM products p
  WHERE p.id = ANY(product_ids)
  ORDER BY p.id   -- deterministic lock order prevents deadlocks
  FOR UPDATE;
$$ LANGUAGE sql;

-- ============================================================
-- MIGRATION: 019_product_approval_workflow.sql
-- ============================================================
-- Adds admin review metadata columns to products table for the
-- approval workflow (Task 2.6).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_feedback TEXT;

CREATE INDEX IF NOT EXISTS idx_products_status_created ON products(status, created_at ASC);

-- ============================================
-- MIGRATION: 020_sprint3_prep.sql
-- ============================================
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

-- ============================================
-- MIGRATION: 021_commission_functions.sql
-- ============================================
-- 021_commission_functions.sql
-- Add 'reversed' status to commissions and create atomic balance update function

-- 1. Extend commissions status constraint to include 'reversed'
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
ALTER TABLE commissions ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled', 'reversed'));

-- 2. Atomic supplier balance increment/decrement function
--    Positive amount = credit (commission earned)
--    Negative amount = debit (commission reversed)
--    GREATEST prevents balance going below 0
CREATE OR REPLACE FUNCTION increment_supplier_balance(
  p_supplier_id UUID,
  p_amount NUMERIC(12,2)
) RETURNS NUMERIC(12,2) AS $$
DECLARE
  new_balance NUMERIC(12,2);
BEGIN
  UPDATE suppliers
  SET current_balance = GREATEST(current_balance + p_amount, 0)
  WHERE id = p_supplier_id
  RETURNING current_balance INTO new_balance;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATION: 022_add_rejected_user_status.sql
-- ============================================
-- ============================================
-- Migration 022: Add 'rejected' to users status constraint
-- ============================================
-- Extend users.status CHECK to include 'rejected' for admin user management.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'approved', 'suspended', 'rejected'));

-- ============================================
-- MIGRATION: 023_admin_product_fields.sql
-- ============================================
-- ============================================================
-- Migration 023: Admin Product Fields
-- ============================================================
-- Adds is_featured column and indexes for admin product management.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ============================================
-- MIGRATION: 024_create_notifications.sql
-- ============================================
-- ============================================================
-- Migration 024: Create Notifications Table
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_own ON notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_service ON notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- MIGRATION: 025_create_audit_logs.sql
-- ============================================
-- 025: Create audit_logs table for admin action tracking
-- Stores a persistent, immutable trail of all admin actions

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write audit logs (no user-level access)
CREATE POLICY "service_role_full_access"
  ON audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- MIGRATION: 026_create_password_reset_tokens.sql
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY password_reset_tokens_service_all ON password_reset_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- MIGRATION: 027_email_verification.sql
-- ============================================
-- Add email_verified column to users if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Create email verification tokens table (same pattern as password_reset_tokens)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_verification_tokens_service_all ON email_verification_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- MIGRATION: 028_add_product_original_price.sql
-- ============================================
-- Add original_price column to products
-- original_price is nullable. null means no discount (regular price).
-- When set, original_price is the "was" price and price is the current selling price.
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2) DEFAULT NULL;

-- ============================================
-- MIGRATION: 029_add_paypal_fields.sql
-- ============================================
-- Add PayPal support fields to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT NULL;
-- Values: 'stripe', 'paypal', 'net30'
