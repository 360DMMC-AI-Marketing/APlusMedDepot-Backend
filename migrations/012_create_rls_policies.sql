-- ============================================
-- Row Level Security (RLS) for APlusMedDepot
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
