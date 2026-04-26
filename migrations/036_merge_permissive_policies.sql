-- ============================================================
-- Migration 036: Merge Overlapping Permissive Policies
-- ============================================================
-- Eliminates all ~91 multiple_permissive_policies warnings by merging
-- admin FOR ALL policies with per-operation user policies into single
-- combined policies per (table, operation). Result: exactly 1 policy
-- per (table, operation) → zero overlap → zero warnings.
--
-- Pattern: user_condition OR (SELECT is_admin())
-- Admin write-only operations get their own per-operation policies.
-- All auth.uid() calls wrapped in (SELECT ...) for initplan optimization.
-- All is_admin()/get_supplier_id() wrapped in (SELECT ...) likewise.
--
-- PRE-CHECK: Before running, verify no master orders have supplier_id set:
--   SELECT COUNT(*) FROM orders WHERE parent_order_id IS NULL AND supplier_id IS NOT NULL;
--   (Expected: 0. If non-zero, investigate before applying.)
-- ============================================================


-- ============================================================
-- 1. USERS
-- ============================================================
-- Old: users_select_own (SELECT), users_update_own (UPDATE), users_admin_all (ALL)
-- New: merged SELECT, merged UPDATE, admin-only INSERT, admin-only DELETE

DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_admin_all ON users;

DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid())::uuid OR (SELECT is_admin()));

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())::uuid OR (SELECT is_admin()))
  WITH CHECK (id = (SELECT auth.uid())::uuid OR (SELECT is_admin()));

DROP POLICY IF EXISTS users_admin_insert ON users;
CREATE POLICY users_admin_insert ON users
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS users_admin_delete ON users;
CREATE POLICY users_admin_delete ON users
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 2. SUPPLIERS
-- ============================================================
-- Old: suppliers_select_own, suppliers_update_own, suppliers_insert_own, suppliers_admin_all
-- New: merged SELECT, merged UPDATE, merged INSERT, admin-only DELETE

DROP POLICY IF EXISTS suppliers_select_own ON suppliers;
DROP POLICY IF EXISTS suppliers_update_own ON suppliers;
DROP POLICY IF EXISTS suppliers_insert_own ON suppliers;
DROP POLICY IF EXISTS suppliers_admin_all ON suppliers;

DROP POLICY IF EXISTS suppliers_select ON suppliers;
CREATE POLICY suppliers_select ON suppliers
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::uuid OR (SELECT is_admin()));

DROP POLICY IF EXISTS suppliers_update ON suppliers;
CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())::uuid OR (SELECT is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid())::uuid OR (SELECT is_admin()));

DROP POLICY IF EXISTS suppliers_insert ON suppliers;
CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = (SELECT auth.uid())::uuid
      AND EXISTS (
        SELECT 1 FROM users
        WHERE id = (SELECT auth.uid())::uuid AND role = 'supplier'
      )
    )
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS suppliers_admin_delete ON suppliers;
CREATE POLICY suppliers_admin_delete ON suppliers
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 3. PRODUCTS  (most complex — needs public read for marketplace)
-- ============================================================
-- Old: products_select_active (SELECT, public), products_supplier_select_own (SELECT),
--      products_supplier_insert (INSERT), products_supplier_update (UPDATE),
--      products_supplier_delete (UPDATE, duplicate!), products_admin_all (ALL)
-- New: merged SELECT (NO "TO authenticated"), merged INSERT, merged UPDATE, admin DELETE

DROP POLICY IF EXISTS products_select_active ON products;
DROP POLICY IF EXISTS products_supplier_select_own ON products;
DROP POLICY IF EXISTS products_supplier_insert ON products;
DROP POLICY IF EXISTS products_supplier_update ON products;
DROP POLICY IF EXISTS products_supplier_delete ON products;
DROP POLICY IF EXISTS products_admin_all ON products;

-- SELECT: NO "TO authenticated" — anonymous users must browse the marketplace.
-- Anonymous: get_supplier_id() → NULL (supplier_id = NULL is false), is_admin() → false.
-- Only (status = 'active' AND is_deleted = false) matches for anon/customers.
DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products
  FOR SELECT
  USING (
    (status = 'active' AND is_deleted = false)
    OR supplier_id = (SELECT get_supplier_id())
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS products_insert ON products;
CREATE POLICY products_insert ON products
  FOR INSERT TO authenticated
  WITH CHECK (
    supplier_id = (SELECT get_supplier_id())
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products
  FOR UPDATE TO authenticated
  USING (supplier_id = (SELECT get_supplier_id()) OR (SELECT is_admin()))
  WITH CHECK (supplier_id = (SELECT get_supplier_id()) OR (SELECT is_admin()));

DROP POLICY IF EXISTS products_admin_delete ON products;
CREATE POLICY products_admin_delete ON products
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 4. ORDERS
-- ============================================================
-- Old: orders_customer_select, orders_supplier_select, orders_admin_all
-- New: merged SELECT (3-way), admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS orders_customer_select ON orders;
DROP POLICY IF EXISTS orders_supplier_select ON orders;
DROP POLICY IF EXISTS orders_admin_all ON orders;

DROP POLICY IF EXISTS orders_select ON orders;
CREATE POLICY orders_select ON orders
  FOR SELECT TO authenticated
  USING (
    (customer_id = (SELECT auth.uid())::uuid AND parent_order_id IS NULL)
    OR (supplier_id = (SELECT get_supplier_id()) AND parent_order_id IS NOT NULL)
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS orders_admin_insert ON orders;
CREATE POLICY orders_admin_insert ON orders
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS orders_admin_update ON orders;
CREATE POLICY orders_admin_update ON orders
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS orders_admin_delete ON orders;
CREATE POLICY orders_admin_delete ON orders
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 5. ORDER_ITEMS
-- ============================================================
-- Old: order_items_customer_select, order_items_supplier_select, order_items_admin_all
-- New: merged SELECT (3-way), admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS order_items_customer_select ON order_items;
DROP POLICY IF EXISTS order_items_supplier_select ON order_items;
DROP POLICY IF EXISTS order_items_admin_all ON order_items;

DROP POLICY IF EXISTS order_items_select ON order_items;
CREATE POLICY order_items_select ON order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = (SELECT auth.uid())::uuid)
    OR supplier_id = (SELECT get_supplier_id())
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS order_items_admin_insert ON order_items;
CREATE POLICY order_items_admin_insert ON order_items
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS order_items_admin_update ON order_items;
CREATE POLICY order_items_admin_update ON order_items
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS order_items_admin_delete ON order_items;
CREATE POLICY order_items_admin_delete ON order_items
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 6. ORDER_STATUS_HISTORY
-- ============================================================
-- Old: order_status_history_customer_select, order_status_history_supplier_select,
--      order_status_history_admin_all
-- New: merged SELECT (3-way), admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS order_status_history_customer_select ON order_status_history;
DROP POLICY IF EXISTS order_status_history_supplier_select ON order_status_history;
DROP POLICY IF EXISTS order_status_history_admin_all ON order_status_history;

DROP POLICY IF EXISTS order_status_history_select ON order_status_history;
CREATE POLICY order_status_history_select ON order_status_history
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = (SELECT auth.uid())::uuid)
    OR order_id IN (SELECT id FROM orders WHERE supplier_id = (SELECT get_supplier_id()))
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS order_status_history_admin_insert ON order_status_history;
CREATE POLICY order_status_history_admin_insert ON order_status_history
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS order_status_history_admin_update ON order_status_history;
CREATE POLICY order_status_history_admin_update ON order_status_history
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS order_status_history_admin_delete ON order_status_history;
CREATE POLICY order_status_history_admin_delete ON order_status_history
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 7. PAYMENTS
-- ============================================================
-- Old: payments_customer_select, payments_admin_all
-- New: merged SELECT, admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS payments_customer_select ON payments;
DROP POLICY IF EXISTS payments_admin_all ON payments;

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS payments_admin_insert ON payments;
CREATE POLICY payments_admin_insert ON payments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS payments_admin_update ON payments;
CREATE POLICY payments_admin_update ON payments
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS payments_admin_delete ON payments;
CREATE POLICY payments_admin_delete ON payments
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 8. COMMISSIONS
-- ============================================================
-- Old: commissions_supplier_select, commissions_admin_all
-- New: merged SELECT, admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS commissions_supplier_select ON commissions;
DROP POLICY IF EXISTS commissions_admin_all ON commissions;

DROP POLICY IF EXISTS commissions_select ON commissions;
CREATE POLICY commissions_select ON commissions
  FOR SELECT TO authenticated
  USING (
    supplier_id = (SELECT get_supplier_id())
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS commissions_admin_insert ON commissions;
CREATE POLICY commissions_admin_insert ON commissions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS commissions_admin_update ON commissions;
CREATE POLICY commissions_admin_update ON commissions
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS commissions_admin_delete ON commissions;
CREATE POLICY commissions_admin_delete ON commissions
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 9. PAYOUTS
-- ============================================================
-- Old: payouts_supplier_select, payouts_admin_all
-- New: merged SELECT, admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS payouts_supplier_select ON payouts;
DROP POLICY IF EXISTS payouts_admin_all ON payouts;

DROP POLICY IF EXISTS payouts_select ON payouts;
CREATE POLICY payouts_select ON payouts
  FOR SELECT TO authenticated
  USING (
    supplier_id = (SELECT get_supplier_id())
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS payouts_admin_insert ON payouts;
CREATE POLICY payouts_admin_insert ON payouts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS payouts_admin_update ON payouts;
CREATE POLICY payouts_admin_update ON payouts
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS payouts_admin_delete ON payouts;
CREATE POLICY payouts_admin_delete ON payouts
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 10. STOCK_AUDIT_LOG
-- ============================================================
-- Old: stock_audit_supplier_select, stock_audit_admin_all
-- New: merged SELECT, admin INSERT/UPDATE/DELETE

DROP POLICY IF EXISTS stock_audit_supplier_select ON stock_audit_log;
DROP POLICY IF EXISTS stock_audit_admin_all ON stock_audit_log;

DROP POLICY IF EXISTS stock_audit_select ON stock_audit_log;
CREATE POLICY stock_audit_select ON stock_audit_log
  FOR SELECT TO authenticated
  USING (
    supplier_id = (SELECT get_supplier_id())
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS stock_audit_admin_insert ON stock_audit_log;
CREATE POLICY stock_audit_admin_insert ON stock_audit_log
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS stock_audit_admin_update ON stock_audit_log;
CREATE POLICY stock_audit_admin_update ON stock_audit_log
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin()))
  WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS stock_audit_admin_delete ON stock_audit_log;
CREATE POLICY stock_audit_admin_delete ON stock_audit_log
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));


-- ============================================================
-- 11. SUPPLIER_DOCUMENTS
-- ============================================================
-- Old: supplier_documents_supplier_select, supplier_documents_supplier_insert,
--      supplier_documents_supplier_update, supplier_documents_admin_all
-- New: merged SELECT, merged INSERT, merged UPDATE, admin DELETE

DROP POLICY IF EXISTS supplier_documents_supplier_select ON supplier_documents;
DROP POLICY IF EXISTS supplier_documents_supplier_insert ON supplier_documents;
DROP POLICY IF EXISTS supplier_documents_supplier_update ON supplier_documents;
DROP POLICY IF EXISTS supplier_documents_admin_all ON supplier_documents;

DROP POLICY IF EXISTS supplier_documents_select ON supplier_documents;
CREATE POLICY supplier_documents_select ON supplier_documents
  FOR SELECT TO authenticated
  USING (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS supplier_documents_insert ON supplier_documents;
CREATE POLICY supplier_documents_insert ON supplier_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS supplier_documents_update ON supplier_documents;
CREATE POLICY supplier_documents_update ON supplier_documents
  FOR UPDATE TO authenticated
  USING (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  )
  WITH CHECK (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = (SELECT auth.uid())::uuid)
    OR (SELECT is_admin())
  );

DROP POLICY IF EXISTS supplier_documents_admin_delete ON supplier_documents;
CREATE POLICY supplier_documents_admin_delete ON supplier_documents
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));
