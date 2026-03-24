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
