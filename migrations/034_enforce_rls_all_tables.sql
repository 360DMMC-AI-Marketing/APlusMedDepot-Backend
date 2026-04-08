-- ============================================================
-- Migration 034: Security Advisor Fixes
-- ============================================================
-- Resolves ALL issues flagged by Supabase Security Advisor on
-- project qbepuyfoxktkuuhnefnw (2026-04-07 scan).
--
-- CRITICAL:  3 tables have RLS disabled (orders, order_items, order_status_history)
-- CRITICAL:  5 service_role bypass policies missing "TO service_role" role scope
-- WARN:     10 functions missing SET search_path
-- ============================================================


-- ============================================================
-- PART 1: Re-enable RLS on 3 tables  (ERROR: rls_disabled_in_public)
-- ============================================================
-- Someone disabled RLS on these tables (likely via Supabase dashboard).
-- Policies still exist but are NOT enforced — anyone with the anon key
-- can read/write/delete all order data directly via PostgREST.

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 2: Fix overly-permissive service_role bypass policies
--         (ERROR: policy_exists_rls_disabled / WARN: rls_policy_always_true)
-- ============================================================
-- These policies use USING(true) WITHOUT "TO service_role", which means
-- ANY role (anon, authenticated) gets unrestricted access.
-- Fix: drop and recreate with explicit "TO service_role" role binding.

-- 2a. users — service_role_bypass (created via dashboard, captured in migration 032)
DROP POLICY IF EXISTS service_role_bypass ON users;
CREATE POLICY service_role_bypass ON users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2b. suppliers — suppliers_service_all (created via dashboard, captured in migration 032)
DROP POLICY IF EXISTS suppliers_service_all ON suppliers;
CREATE POLICY suppliers_service_all ON suppliers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2c. audit_logs — service_role_full_access (migration 025 missing TO clause)
DROP POLICY IF EXISTS service_role_full_access ON audit_logs;
CREATE POLICY service_role_full_access ON audit_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2d. password_reset_tokens — service_role_bypass (dashboard duplicate)
--     The correct policy (password_reset_tokens_service_all TO service_role) already exists
DROP POLICY IF EXISTS service_role_bypass ON password_reset_tokens;

-- 2e. email_verification_tokens — service_role_bypass (dashboard duplicate)
--     The correct policy (email_verification_tokens_service_all TO service_role) already exists
DROP POLICY IF EXISTS service_role_bypass ON email_verification_tokens;

-- 2f. Fix dashboard-created service_role_all policies on order tables
--     These were likely added when RLS was toggled off/on via dashboard.
--     Recreate with proper role scoping.
DROP POLICY IF EXISTS service_role_all ON orders;
CREATE POLICY service_role_all ON orders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON order_items;
CREATE POLICY service_role_all ON order_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON order_status_history;
CREATE POLICY service_role_all ON order_status_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================
-- PART 3: Fix function search_path  (WARN: function_search_path_mutable)
-- ============================================================
-- Without SET search_path, a malicious user could create objects in a
-- schema that appears earlier in the search path and shadow our tables.
-- All auth.uid() calls are fully qualified, so search_path = public is safe.

-- 3a. update_updated_at_column (from migration 000)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- 3b. get_current_user_id (from migration 012)
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
  SELECT auth.uid()::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- 3c. get_current_user_role (from migration 012)
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM users WHERE id = auth.uid()::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- 3d. is_admin (from migration 012)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_current_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- 3e. get_supplier_id (from migration 012)
CREATE OR REPLACE FUNCTION get_supplier_id()
RETURNS UUID AS $$
  SELECT id FROM suppliers WHERE user_id = auth.uid()::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- 3f. prevent_supplier_self_approval (from migration 014)
CREATE OR REPLACE FUNCTION prevent_supplier_self_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.user_id = auth.uid()::uuid THEN
    IF EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::uuid
      AND role = 'supplier'
    ) THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 3g. lock_products_for_update (from migration 018)
CREATE OR REPLACE FUNCTION lock_products_for_update(product_ids UUID[])
RETURNS TABLE(id UUID, stock_quantity INTEGER) AS $$
  SELECT p.id, p.stock_quantity
  FROM products p
  WHERE p.id = ANY(product_ids)
  ORDER BY p.id
  FOR UPDATE;
$$ LANGUAGE sql
SET search_path = public;

-- 3h. increment_supplier_balance (from migration 021)
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
$$ LANGUAGE plpgsql
SET search_path = public;

-- 3i. deduct_credit (from migration 030)
CREATE OR REPLACE FUNCTION deduct_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE user_credit
  SET credit_used = credit_used + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND eligible = true
    AND (credit_limit - credit_used) >= p_amount;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- 3j. restore_credit (from migration 030)
CREATE OR REPLACE FUNCTION restore_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE user_credit
  SET credit_used = GREATEST(credit_used - p_amount, 0),
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;


-- ============================================================
-- PART 4: Catch-all — enable RLS on any remaining public tables
-- ============================================================
-- Safety net for tables created via dashboard that we don't know about.

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    RAISE NOTICE 'Enabled RLS on: %', tbl.tablename;
  END LOOP;
END $$;
