-- ============================================================
-- Migration 035: Performance & Info Fixes
-- ============================================================
-- Resolves ALL remaining Supabase Advisor warnings after migration 034.
--
-- PERF:  17 policies using auth.uid() without (SELECT ...) wrapper
-- PERF:  ~40 multiple_permissive_policies warnings on carts/cart_items
-- INFO:  3 tables with RLS enabled but no policies
-- ============================================================


-- ============================================================
-- PART 1: Fix auth_rls_initplan — wrap auth.uid() in (SELECT ...)
-- ============================================================
-- Without the wrapper, auth.uid() is re-evaluated for EVERY row.
-- Wrapping in (SELECT ...) makes PostgreSQL evaluate it once per query.
-- Each policy must be dropped and recreated (no ALTER for USING clause).

-- ------------------------------------------
-- 1a. users.users_select_own
-- ------------------------------------------
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (id = (SELECT auth.uid())::uuid);

-- ------------------------------------------
-- 1b. users.users_update_own
-- ------------------------------------------
DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = (SELECT auth.uid())::uuid)
  WITH CHECK (id = (SELECT auth.uid())::uuid);

-- ------------------------------------------
-- 1c. suppliers.suppliers_select_own
-- ------------------------------------------
DROP POLICY IF EXISTS suppliers_select_own ON suppliers;
CREATE POLICY suppliers_select_own ON suppliers
  FOR SELECT
  USING (user_id = (SELECT auth.uid())::uuid);

-- ------------------------------------------
-- 1d. suppliers.suppliers_update_own
-- ------------------------------------------
DROP POLICY IF EXISTS suppliers_update_own ON suppliers;
CREATE POLICY suppliers_update_own ON suppliers
  FOR UPDATE
  USING (user_id = (SELECT auth.uid())::uuid)
  WITH CHECK (user_id = (SELECT auth.uid())::uuid);

-- ------------------------------------------
-- 1e. suppliers.suppliers_insert_own
-- ------------------------------------------
DROP POLICY IF EXISTS suppliers_insert_own ON suppliers;
CREATE POLICY suppliers_insert_own ON suppliers
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())::uuid
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())::uuid
      AND role = 'supplier'
    )
  );

-- ------------------------------------------
-- 1f. orders.orders_customer_select
-- ------------------------------------------
DROP POLICY IF EXISTS orders_customer_select ON orders;
CREATE POLICY orders_customer_select ON orders
  FOR SELECT
  USING (customer_id = (SELECT auth.uid())::uuid AND parent_order_id IS NULL);

-- ------------------------------------------
-- 1g. order_items.order_items_customer_select
-- ------------------------------------------
DROP POLICY IF EXISTS order_items_customer_select ON order_items;
CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = (SELECT auth.uid())::uuid));

-- ------------------------------------------
-- 1h. order_status_history.order_status_history_customer_select
-- ------------------------------------------
DROP POLICY IF EXISTS order_status_history_customer_select ON order_status_history;
CREATE POLICY order_status_history_customer_select ON order_status_history
  FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = (SELECT auth.uid())::uuid));

-- ------------------------------------------
-- 1i. payments.payments_customer_select
-- ------------------------------------------
DROP POLICY IF EXISTS payments_customer_select ON payments;
CREATE POLICY payments_customer_select ON payments
  FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = (SELECT auth.uid())::uuid));

-- ------------------------------------------
-- 1j. notifications.notifications_own
-- ------------------------------------------
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ------------------------------------------
-- 1k. user_credit.user_credit_own_read
-- ------------------------------------------
DROP POLICY IF EXISTS user_credit_own_read ON user_credit;
CREATE POLICY user_credit_own_read ON user_credit
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ------------------------------------------
-- 1l. invoices.invoices_own_read
-- ------------------------------------------
DROP POLICY IF EXISTS invoices_own_read ON invoices;
CREATE POLICY invoices_own_read ON invoices
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ------------------------------------------
-- 1m. supplier_documents.supplier_documents_supplier_select
-- ------------------------------------------
DROP POLICY IF EXISTS supplier_documents_supplier_select ON supplier_documents;
CREATE POLICY supplier_documents_supplier_select ON supplier_documents
  FOR SELECT
  USING (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid
    )
  );

-- ------------------------------------------
-- 1n. supplier_documents.supplier_documents_supplier_insert
-- ------------------------------------------
DROP POLICY IF EXISTS supplier_documents_supplier_insert ON supplier_documents;
CREATE POLICY supplier_documents_supplier_insert ON supplier_documents
  FOR INSERT
  WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid
    )
  );

-- ------------------------------------------
-- 1o. supplier_documents.supplier_documents_supplier_update
-- ------------------------------------------
DROP POLICY IF EXISTS supplier_documents_supplier_update ON supplier_documents;
CREATE POLICY supplier_documents_supplier_update ON supplier_documents
  FOR UPDATE
  USING (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid
    )
  )
  WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid
    )
  );


-- ============================================================
-- PART 2: Fix multiple_permissive_policies on carts & cart_items
-- ============================================================
-- carts has 2 overlapping FOR ALL policies: carts_customer_crud + carts_admin_all
-- cart_items has 2 overlapping FOR ALL policies: cart_items_customer_crud + cart_items_admin_all
-- Fix: merge each pair into a single policy scoped TO authenticated.
-- Logical behavior is identical (permissive policies are OR'd).

-- ------------------------------------------
-- 2a. carts — merge into single policy
-- ------------------------------------------
DROP POLICY IF EXISTS carts_customer_crud ON carts;
DROP POLICY IF EXISTS carts_admin_all ON carts;
DROP POLICY IF EXISTS carts_access ON carts;

CREATE POLICY carts_access ON carts
  FOR ALL TO authenticated
  USING (
    customer_id = (SELECT auth.uid())::uuid
    OR (SELECT is_admin())
  )
  WITH CHECK (
    customer_id = (SELECT auth.uid())::uuid
    OR (SELECT is_admin())
  );

-- ------------------------------------------
-- 2b. cart_items — merge into single policy
-- ------------------------------------------
DROP POLICY IF EXISTS cart_items_customer_crud ON cart_items;
DROP POLICY IF EXISTS cart_items_admin_all ON cart_items;
DROP POLICY IF EXISTS cart_items_access ON cart_items;

CREATE POLICY cart_items_access ON cart_items
  FOR ALL TO authenticated
  USING (
    cart_id IN (SELECT id FROM carts WHERE customer_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  )
  WITH CHECK (
    cart_id IN (SELECT id FROM carts WHERE customer_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  );


-- ============================================================
-- PART 3: Add policies for INFO tables (RLS enabled, no policies)
-- ============================================================
-- These tables were created via Supabase dashboard.
-- RLS is enabled (= locked down) but having no policies triggers an INFO.
-- Add explicit service_role + admin policies to document intent.

-- ------------------------------------------
-- 3a. _migrations — internal migration tracking, service_role only
-- ------------------------------------------
DROP POLICY IF EXISTS migrations_service_all ON _migrations;
CREATE POLICY migrations_service_all ON _migrations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------
-- 3b. chatbot_leads — lead capture, service_role write + admin read
-- ------------------------------------------
DROP POLICY IF EXISTS chatbot_leads_service_all ON chatbot_leads;
CREATE POLICY chatbot_leads_service_all ON chatbot_leads
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chatbot_leads_admin_read ON chatbot_leads;
CREATE POLICY chatbot_leads_admin_read ON chatbot_leads
  FOR SELECT TO authenticated
  USING ((SELECT is_admin()));

-- ------------------------------------------
-- 3c. leads — lead capture, service_role write + admin read
-- ------------------------------------------
DROP POLICY IF EXISTS leads_service_all ON leads;
CREATE POLICY leads_service_all ON leads
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS leads_admin_read ON leads;
CREATE POLICY leads_admin_read ON leads
  FOR SELECT TO authenticated
  USING ((SELECT is_admin()));
