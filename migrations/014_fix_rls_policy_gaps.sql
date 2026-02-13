-- ============================================
-- Fix RLS Policy Gaps — APlusMedDepot
-- Migration 014
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
