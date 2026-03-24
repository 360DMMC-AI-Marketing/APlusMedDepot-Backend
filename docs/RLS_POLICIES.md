# Row Level Security (RLS) Policies — APlusMedDepot

Last audited: 2026-02-13 (Migration 017)

---

## Overview

All tables have RLS enabled. The service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS
entirely — it is used only in backend services running as the API server. User-facing Supabase
clients (anon key + JWT) are subject to all policies below.

### Helper Functions (Migration 012)

| Function | Behaviour |
|---|---|
| `get_current_user_id()` | Returns `auth.uid()` cast to UUID |
| `get_current_user_role()` | Reads `role` from `users` table for current auth user |
| `is_admin()` | Returns `true` when `get_current_user_role() = 'admin'` |
| `get_supplier_id()` | Returns `suppliers.id` WHERE `user_id = auth.uid()` |

All helper functions are `SECURITY DEFINER STABLE` — they execute with elevated privileges so
they can query the `users`/`suppliers` tables even when those tables have RLS enabled.

---

## Products Table

RLS enabled. Five active policies after Migration 017.

### Access Matrix

| Action | Customer | Supplier (own) | Supplier (other's) | Admin |
|---|---|---|---|---|
| SELECT active products | ✓ (status='active', is_deleted=false) | ✓ | ✓ (only active ones) | ✓ all |
| SELECT pending/rejected/needs_revision | ✗ | ✓ own only | ✗ | ✓ all |
| INSERT | ✗ | ✓ supplier_id must match | ✗ (blocked) | ✓ |
| UPDATE | ✗ | ✓ own only | ✗ (0 rows, silent) | ✓ all |
| DELETE (hard) | ✗ | ✗ | ✗ | ✓ |
| Soft-delete (UPDATE is_deleted=true) | ✗ | ✓ own only | ✗ | ✓ all |

### Policy Definitions

```sql
-- Any authenticated user can see active, non-deleted products (marketplace browsing)
CREATE POLICY products_select_active ON products
  FOR SELECT
  USING (status = 'active' AND is_deleted = false);

-- Suppliers see ALL their own products regardless of status (including pending/rejected/needs_revision)
CREATE POLICY products_supplier_select_own ON products
  FOR SELECT
  USING (supplier_id = get_supplier_id());

-- Suppliers can only insert products for their own supplier account
CREATE POLICY products_supplier_insert ON products
  FOR INSERT
  WITH CHECK (supplier_id = get_supplier_id());

-- Suppliers can update (including soft-delete) only their own products
CREATE POLICY products_supplier_update ON products
  FOR UPDATE
  USING (supplier_id = get_supplier_id())
  WITH CHECK (supplier_id = get_supplier_id());

-- Admins have unrestricted access to all products
CREATE POLICY products_admin_all ON products
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
```

### Status Lifecycle (updated in Migration 017)

```
pending  ──admin approve──▶  active
pending  ──admin reject──▶   rejected
pending  ──admin request──▶  needs_revision
rejected ──supplier edit──▶  pending   (re-submission)
needs_revision ──edit──▶     pending   (re-submission)
active   ──supplier/admin──▶ inactive  (de-listing)
active / pending / * ──supplier soft-delete──▶ inactive + is_deleted=true
```

Valid status values: `pending`, `active`, `inactive`, `rejected`, `needs_revision`

### Important Notes

- **RLS does NOT filter `is_deleted`** for the `products_supplier_select_own` policy. Suppliers
  can see their own soft-deleted products at the database level. The application layer in
  `SupplierProductService` adds `.eq("is_deleted", false)` as a second guard. This two-layer
  approach is intentional: the DB layer enforces ownership, the service layer enforces business rules.
- **Cross-supplier UPDATE** is silently blocked (0 rows affected, no error). This is PostgreSQL's
  default RLS behaviour for `UPDATE` — rows that fail `USING` are invisible to the query.
- **SKU uniqueness** is enforced globally at the DB level (`UNIQUE` constraint on `sku`) and
  additionally at the per-supplier level in application code. Both guards apply.

---

## Users Table

| Policy | Operation | Condition |
|---|---|---|
| `users_select_own` | SELECT | `id = auth.uid()` |
| `users_update_own` | UPDATE | `id = auth.uid()` |
| `users_admin_all` | ALL | `is_admin()` |

Customers and suppliers can only read and update their own user record.

---

## Suppliers Table

| Policy | Operation | Condition |
|---|---|---|
| `suppliers_select_own` | SELECT | `user_id = auth.uid()` |
| `suppliers_update_own` | UPDATE | `user_id = auth.uid()` |
| `suppliers_insert_own` | INSERT | `user_id = auth.uid()` AND `role = 'supplier'` in users |
| `suppliers_admin_all` | ALL | `is_admin()` |

A trigger (`enforce_supplier_update_restrictions`) prevents suppliers from self-modifying
sensitive fields: `status`, `commission_rate`, `approved_at`, `approved_by`, `current_balance`.

---

## Supplier Documents Table

| Policy | Operation | Condition |
|---|---|---|
| `supplier_documents_supplier_select` | SELECT | `supplier_id IN (own supplier)` |
| `supplier_documents_supplier_insert` | INSERT | `supplier_id IN (own supplier)` |
| `supplier_documents_supplier_update` | UPDATE | `supplier_id IN (own supplier)` |
| `supplier_documents_admin_all` | ALL | `is_admin()` |

---

## Carts Table

| Policy | Operation | Condition |
|---|---|---|
| `carts_customer_crud` | ALL | `customer_id = auth.uid()` |
| `carts_admin_all` | ALL | `is_admin()` |

---

## Cart Items Table

| Policy | Operation | Condition |
|---|---|---|
| `cart_items_customer_crud` | ALL | `cart_id IN (own carts)` |
| `cart_items_admin_all` | ALL | `is_admin()` |

---

## Orders Table

| Policy | Operation | Condition |
|---|---|---|
| `orders_customer_select` | SELECT | `customer_id = auth.uid()` AND `parent_order_id IS NULL` |
| `orders_supplier_select` | SELECT | `supplier_id = get_supplier_id()` AND `parent_order_id IS NOT NULL` |
| `orders_admin_all` | ALL | `is_admin()` |

Customers see master orders (`parent_order_id IS NULL`); suppliers see sub-orders
(`parent_order_id IS NOT NULL`) assigned to them.

---

## Order Items Table

| Policy | Operation | Condition |
|---|---|---|
| `order_items_customer_select` | SELECT | `order_id IN (own orders)` |
| `order_items_supplier_select` | SELECT | `supplier_id = get_supplier_id()` |
| `order_items_admin_all` | ALL | `is_admin()` |

---

## Payments Table

| Policy | Operation | Condition |
|---|---|---|
| `payments_customer_select` | SELECT | `order_id IN (own orders)` |
| `payments_admin_all` | ALL | `is_admin()` |

Suppliers have **no access** to payment data.

---

## Commissions Table

| Policy | Operation | Condition |
|---|---|---|
| `commissions_supplier_select` | SELECT | `supplier_id = get_supplier_id()` |
| `commissions_admin_all` | ALL | `is_admin()` |

Customers have **no access** to commission data.

---

## Payouts Table

| Policy | Operation | Condition |
|---|---|---|
| `payouts_supplier_select` | SELECT | `supplier_id = get_supplier_id()` |
| `payouts_admin_all` | ALL | `is_admin()` |

---

## Migration History

| Migration | Description |
|---|---|
| 012_create_rls_policies.sql | Initial RLS enable + all base policies |
| 013_align_supplier_schema.sql | supplier_documents table + RLS (partial) |
| 014_fix_rls_policy_gaps.sql | Gaps: suppliers INSERT, supplier_documents update, admin cart access, self-approval trigger |
| 017_audit_rls_supplier_products.sql | Gap: products status CHECK constraint (old values); drop redundant products_supplier_delete policy |

---

## Testing

RLS is tested at the database level (bypassing Express routes) in:
- `tests/integration/rls.supplier-isolation.test.ts` — supplier/customer/admin isolation (original)
- `tests/integration/rls/supplierProductRls.test.ts` — full 9-block matrix for supplier product policies

Tests require a real Supabase project. They are skipped automatically when
`SUPABASE_URL` contains `test.supabase.co` or `localhost`.
