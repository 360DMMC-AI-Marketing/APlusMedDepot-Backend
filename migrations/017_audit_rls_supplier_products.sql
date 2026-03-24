-- ============================================================
-- Migration 017: Audit & Harden RLS for Supplier Products
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
--   products_select_active        : any auth user SELECT WHERE status='active' AND is_deleted=false ✓
--   products_supplier_select_own  : suppliers SELECT WHERE supplier_id = get_supplier_id() ✓
--   products_supplier_insert      : suppliers INSERT WHERE supplier_id = get_supplier_id() ✓
--   products_supplier_update      : suppliers UPDATE WHERE supplier_id = get_supplier_id() ✓
--   products_admin_all            : admins ALL ✓
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
