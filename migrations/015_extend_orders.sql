-- ============================================
-- Migration 015: Extend orders for multi-supplier support
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
