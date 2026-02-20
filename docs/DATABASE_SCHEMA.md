# APlusMedDepot — Database Schema

## Overview

PostgreSQL database for a multi-vendor medical supplies marketplace. All tables use UUID primary keys with `gen_random_uuid()` and automatic `updated_at` timestamps via trigger.

**Migration order:** 000 → 001 → 002 → ... → 019 (FK dependencies are satisfied sequentially).

**Note:** `commission_rate` is stored as a percentage everywhere (15.00 = 15%), not a decimal fraction.

---

## Tables

### 1. users

Stores all platform users across all roles.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| email | VARCHAR | UNIQUE, NOT NULL |
| password_hash | VARCHAR | NOT NULL |
| first_name | VARCHAR | NOT NULL |
| last_name | VARCHAR | NOT NULL |
| company_name | VARCHAR | nullable |
| phone | VARCHAR | nullable |
| role | VARCHAR | NOT NULL, CHECK IN ('customer', 'supplier', 'admin') |
| status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'approved', 'suspended') |
| last_login | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Trigger:** `set_users_updated_at` — auto-updates `updated_at` on row update.

---

### 2. suppliers

Extended profile for users with role = 'supplier'.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | UNIQUE, NOT NULL, FK → users(id) ON DELETE CASCADE |
| business_name | VARCHAR | NOT NULL |
| tax_id | VARCHAR | nullable |
| business_type | VARCHAR(100) | nullable |
| address | JSONB | DEFAULT '{}' |
| phone | VARCHAR | nullable |
| contact_name | VARCHAR(255) | nullable |
| contact_email | VARCHAR(255) | nullable |
| commission_rate | NUMERIC(5,2) | NOT NULL, DEFAULT 15.00, CHECK >= 0 AND <= 100 |
| status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'under_review', 'approved', 'rejected', 'needs_revision', 'suspended') |
| bank_account_info | JSONB | DEFAULT '{}' |
| product_categories | TEXT[] | nullable |
| rejection_reason | TEXT | nullable |
| current_balance | NUMERIC(12,2) | NOT NULL, DEFAULT 0.00 |
| years_in_business | INTEGER | nullable |
| approved_at | TIMESTAMPTZ | nullable |
| approved_by | UUID | FK → users(id), nullable |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Commission rates:** Stored as percentage — Default 15% (15.00), high-volume 12% (12.00), premium category 18% (18.00).

**Address JSON shape:** `{"street": "...", "city": "...", "state": "...", "zip": "...", "country": "US"}`

**Bank account info JSON shape:** `{"bank_name": "...", "account_type": "checking", "routing_number_last4": "1234", "account_number_last4": "5678"}`

**Trigger:** `set_suppliers_updated_at`

---

### 2a. supplier_documents

Documents uploaded by suppliers for verification (business license, insurance, tax docs, W9).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| supplier_id | UUID | NOT NULL, FK → suppliers(id) ON DELETE CASCADE |
| document_type | VARCHAR(50) | NOT NULL, CHECK IN ('business_license', 'insurance_certificate', 'tax_document', 'w9', 'other') |
| file_name | VARCHAR(255) | NOT NULL |
| file_size | INTEGER | nullable |
| mime_type | VARCHAR(100) | nullable |
| storage_path | TEXT | NOT NULL |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'approved', 'rejected') |
| rejection_reason | TEXT | nullable — admin provides reason per rejected document |
| review_notes | TEXT | nullable |
| uploaded_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| reviewed_at | TIMESTAMPTZ | nullable |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Indexes:** `idx_supplier_docs_supplier_id`, `idx_supplier_docs_type`, `idx_supplier_docs_status`

**Trigger:** `set_supplier_documents_updated_at`

---

### 3. products

Medical supply items listed by suppliers.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| supplier_id | UUID | NOT NULL, FK → suppliers(id) ON DELETE CASCADE |
| name | VARCHAR | NOT NULL |
| description | TEXT | nullable |
| sku | VARCHAR | UNIQUE, NOT NULL |
| price | DECIMAL(10,2) | NOT NULL, CHECK > 0 |
| stock_quantity | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 |
| category | VARCHAR | nullable |
| status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'active', 'inactive', 'rejected', 'needs_revision') |
| images | JSONB | DEFAULT '[]' |
| specifications | JSONB | DEFAULT '{}' |
| weight | DECIMAL(8,2) | nullable |
| dimensions | JSONB | nullable |
| is_deleted | BOOLEAN | DEFAULT false |
| low_stock_threshold | INTEGER | NOT NULL, DEFAULT 10 |
| last_restocked_at | TIMESTAMPTZ | nullable |
| reviewed_by | UUID | FK → users(id), nullable |
| reviewed_at | TIMESTAMPTZ | nullable |
| admin_feedback | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Status values:** `pending` (newly submitted, awaiting review) → `active` (approved, listed) / `rejected` (admin rejected) / `needs_revision` (admin requested changes). `inactive` (supplier-deactivated). Updated from legacy values in migration 017.

**Inventory columns:** `low_stock_threshold` and `last_restocked_at` added in migration 018 for supplier inventory management.

**Review columns:** `reviewed_by`, `reviewed_at`, `admin_feedback` added in migration 019 for admin product approval workflow.

**Trigger:** `set_products_updated_at`

---

### 4. carts

Server-side shopping carts (never client-side).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| customer_id | UUID | NOT NULL, FK → users(id) |
| status | VARCHAR | NOT NULL, DEFAULT 'active', CHECK IN ('active', 'converted', 'abandoned') |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Trigger:** `set_carts_updated_at`

---

### 5. cart_items

Individual line items in a cart.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| cart_id | UUID | NOT NULL, FK → carts(id) ON DELETE CASCADE |
| product_id | UUID | NOT NULL, FK → products(id) |
| quantity | INTEGER | NOT NULL, CHECK > 0 |
| unit_price | DECIMAL(10,2) | NOT NULL, CHECK > 0 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Unique constraint:** (cart_id, product_id) — one entry per product per cart.

**Trigger:** `set_cart_items_updated_at`

---

### 6. orders

Master orders (customer-facing) and sub-orders (per supplier). Self-referencing FK via `parent_order_id`.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| order_number | VARCHAR | UNIQUE, NOT NULL |
| customer_id | UUID | NOT NULL, FK → users(id) |
| parent_order_id | UUID | FK → orders(id), nullable |
| supplier_id | UUID | FK → suppliers(id), nullable |
| total_amount | DECIMAL(10,2) | NOT NULL |
| tax_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 |
| shipping_address | JSONB | NOT NULL |
| status | VARCHAR | NOT NULL, DEFAULT 'pending_payment', CHECK IN ('pending_payment', 'payment_processing', 'payment_confirmed', 'awaiting_fulfillment', 'partially_shipped', 'fully_shipped', 'delivered', 'cancelled', 'refunded') |
| payment_status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded') |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Order splitting:** Master orders have `parent_order_id = NULL` and `supplier_id = NULL`. Sub-orders reference the master via `parent_order_id` and specify `supplier_id`.

**Trigger:** `set_orders_updated_at`

---

### 7. order_items

Individual line items within an order.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| order_id | UUID | NOT NULL, FK → orders(id) ON DELETE CASCADE |
| product_id | UUID | NOT NULL, FK → products(id) |
| supplier_id | UUID | NOT NULL, FK → suppliers(id) |
| quantity | INTEGER | NOT NULL, CHECK > 0 |
| unit_price | DECIMAL(10,2) | NOT NULL |
| subtotal | DECIMAL(10,2) | NOT NULL |
| fulfillment_status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') |
| shipped_at | TIMESTAMPTZ | nullable — when the item was shipped |
| tracking_number | VARCHAR(100) | nullable — carrier tracking number |
| carrier | VARCHAR(50) | nullable — shipping carrier name |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Shipping columns** support Flow 6 (Supplier Order Fulfillment): carrier selection, tracking number, ship date.

**Trigger:** `set_order_items_updated_at`

---

### 8. payments

Stripe PaymentIntent records for orders.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| order_id | UUID | NOT NULL, FK → orders(id) |
| stripe_payment_intent_id | VARCHAR | UNIQUE, NOT NULL |
| amount | DECIMAL(10,2) | NOT NULL |
| currency | VARCHAR | NOT NULL, DEFAULT 'usd' |
| status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded') |
| stripe_charge_id | VARCHAR | nullable |
| failure_reason | TEXT | nullable |
| metadata | JSONB | DEFAULT '{}' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Trigger:** `set_payments_updated_at`

---

### 9. commissions

Per-line-item commission tracking. One commission entry per order_item.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| order_item_id | UUID | UNIQUE, NOT NULL, FK → order_items(id) |
| supplier_id | UUID | NOT NULL, FK → suppliers(id) |
| sale_amount | DECIMAL(10,2) | NOT NULL |
| commission_rate | NUMERIC(5,2) | NOT NULL, CHECK >= 0 AND <= 100 |
| commission_amount | DECIMAL(10,2) | NOT NULL |
| platform_amount | DECIMAL(10,2) | NOT NULL — same as commission_amount |
| supplier_payout | DECIMAL(10,2) | NOT NULL |
| supplier_amount | NUMERIC(12,2) | nullable — sale_amount minus commission_amount |
| status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'confirmed', 'paid', 'cancelled') |
| confirmed_at | TIMESTAMPTZ | nullable — when commission is locked in (item shipped) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Calculation:** `commission_amount = sale_amount * (commission_rate / 100)`, `supplier_payout = sale_amount - commission_amount`

**Note:** `commission_rate` is stored as percentage (15.00 = 15%). Column was renamed from `payout_status` to `status` in migration 013.

**Trigger:** `set_commissions_updated_at`

---

### 10. payouts

Monthly supplier payout records.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| supplier_id | UUID | NOT NULL, FK → suppliers(id) |
| amount | DECIMAL(10,2) | NOT NULL |
| commission_total | DECIMAL(10,2) | NOT NULL |
| period_start | DATE | NOT NULL |
| period_end | DATE | NOT NULL |
| payout_date | DATE | nullable |
| status | VARCHAR | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'processing', 'completed', 'failed') |
| is_early_payout | BOOLEAN | DEFAULT false |
| early_payout_fee | DECIMAL(10,2) | DEFAULT 0 |
| transaction_ref | VARCHAR | nullable |
| invoice_url | VARCHAR | nullable |
| items_count | INTEGER | NOT NULL, DEFAULT 0 |
| payout_method | VARCHAR(50) | DEFAULT 'ach_transfer' — ACH bank transfer for MVP |
| scheduled_at | TIMESTAMPTZ | nullable — 15th of each month per Flow 12 |
| processed_at | TIMESTAMPTZ | nullable — when payout was actually executed |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Schedule:** Monthly on the 15th, minimum $50 threshold. Early payout incurs 2.5% fee. Default payout method is ACH bank transfer.

**Trigger:** `set_payouts_updated_at`

---

### 11. stock_audit_log

Audit trail for all stock quantity changes (supplier updates, bulk updates, order decrements, refunds).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| supplier_id | UUID | NOT NULL, FK → suppliers(id) ON DELETE CASCADE |
| old_quantity | INTEGER | NOT NULL |
| new_quantity | INTEGER | NOT NULL |
| change_source | VARCHAR(50) | NOT NULL, DEFAULT 'supplier_update', CHECK IN ('supplier_update', 'bulk_update', 'order_decrement', 'order_refund') |
| changed_by | UUID | FK → users(id), nullable |
| changed_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**No updated_at trigger** — audit log entries are immutable (insert-only).

---

## Indexes

Indexes are created in `migrations/011_create_indexes.sql`, `migrations/013_align_supplier_schema.sql`, `migrations/018_supplier_inventory.sql`, and `migrations/019_product_approval_workflow.sql`.

| Table | Index | Type | Column(s) / Expression |
|-------|-------|------|------------------------|
| users | idx_users_email | B-tree | email |
| users | idx_users_role | B-tree | role |
| users | idx_users_status | B-tree | status |
| suppliers | idx_suppliers_user_id | B-tree | user_id |
| suppliers | idx_suppliers_status | B-tree | status |
| suppliers | idx_suppliers_business_name | B-tree | business_name |
| suppliers | idx_suppliers_created_at | B-tree | created_at DESC |
| products | idx_products_supplier_id | B-tree | supplier_id |
| products | idx_products_category | B-tree | category |
| products | idx_products_status | B-tree | status |
| products | idx_products_sku | B-tree | sku |
| products | idx_products_is_deleted | B-tree | is_deleted |
| products | idx_products_search | GIN | to_tsvector('english', name) |
| carts | idx_carts_customer_active | B-tree (partial) | customer_id WHERE status = 'active' |
| orders | idx_orders_customer_id | B-tree | customer_id |
| orders | idx_orders_parent_order_id | B-tree | parent_order_id |
| orders | idx_orders_supplier_id | B-tree | supplier_id |
| orders | idx_orders_status | B-tree | status |
| orders | idx_orders_order_number | B-tree | order_number |
| orders | idx_orders_payment_status | B-tree | payment_status |
| order_items | idx_order_items_order_id | B-tree | order_id |
| order_items | idx_order_items_supplier_id | B-tree | supplier_id |
| order_items | idx_order_items_product_id | B-tree | product_id |
| payments | idx_payments_order_id | B-tree | order_id |
| payments | idx_payments_stripe_payment_intent_id | B-tree | stripe_payment_intent_id |
| payments | idx_payments_status | B-tree | status |
| supplier_documents | idx_supplier_docs_supplier_id | B-tree | supplier_id |
| supplier_documents | idx_supplier_docs_type | B-tree | document_type |
| supplier_documents | idx_supplier_docs_status | B-tree | status |
| commissions | idx_commissions_supplier_id | B-tree | supplier_id |
| commissions | idx_commissions_payout_status | B-tree | status (renamed from payout_status) |
| payouts | idx_payouts_supplier_id | B-tree | supplier_id |
| payouts | idx_payouts_status | B-tree | status |
| payouts | idx_payouts_payout_date | B-tree | payout_date |
| products | idx_products_status_created | B-tree | (status, created_at ASC) |
| stock_audit_log | idx_stock_audit_product_id | B-tree | product_id |
| stock_audit_log | idx_stock_audit_supplier_id | B-tree | supplier_id |
| stock_audit_log | idx_stock_audit_changed_at | B-tree | changed_at DESC |

---

## Entity Relationships

```
users 1──1 suppliers          (user_id, ON DELETE CASCADE)
suppliers 1──N supplier_documents (supplier_id, ON DELETE CASCADE)
suppliers 1──N products       (supplier_id, ON DELETE CASCADE)
users 1──N carts              (customer_id)
carts 1──N cart_items          (cart_id, ON DELETE CASCADE)
products 1──N cart_items       (product_id)
users 1──N orders              (customer_id)
orders 1──N orders             (parent_order_id, self-ref)
suppliers 1──N orders          (supplier_id)
orders 1──N order_items        (order_id, ON DELETE CASCADE)
products 1──N order_items      (product_id)
suppliers 1──N order_items     (supplier_id)
orders 1──N payments           (order_id)
order_items 1──1 commissions   (order_item_id, UNIQUE)
suppliers 1──N commissions     (supplier_id)
suppliers 1──N payouts         (supplier_id)
products 1──N stock_audit_log  (product_id, ON DELETE CASCADE)
suppliers 1──N stock_audit_log (supplier_id, ON DELETE CASCADE)
users 1──0..1 suppliers.approved_by (approved_by)
users 1──0..N products.reviewed_by (reviewed_by)
```

---

## Row Level Security (RLS)

All tables have RLS enabled. The Supabase service role key bypasses RLS entirely. These policies apply when using the anon key or user JWT.

### Helper Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `get_current_user_id()` | UUID | Returns `auth.uid()::uuid` |
| `get_current_user_role()` | VARCHAR | Looks up role from users table for current auth user |
| `is_admin()` | BOOLEAN | Returns true if current user's role = 'admin' |
| `get_supplier_id()` | UUID | Returns the supplier.id for the current auth user |

All helper functions use `SECURITY DEFINER` and `STABLE` to ensure they run with the function owner's permissions and are cacheable within a transaction.

### Policies by Table

#### users

| Policy | Operation | Rule |
|--------|-----------|------|
| `users_select_own` | SELECT | `id = auth.uid()` — users see their own profile |
| `users_update_own` | UPDATE | `id = auth.uid()` — users edit their own profile |
| `users_admin_all` | ALL | `is_admin()` — admins have full access |

#### suppliers

| Policy | Operation | Rule |
|--------|-----------|------|
| `suppliers_select_own` | SELECT | `user_id = auth.uid()` — suppliers see their own profile |
| `suppliers_update_own` | UPDATE | `user_id = auth.uid()` — suppliers edit their own profile |
| `suppliers_insert_own` | INSERT | `user_id = auth.uid() AND user.role = 'supplier'` — suppliers create their own record during registration *(added in 014)* |
| `suppliers_admin_all` | ALL | `is_admin()` — admins have full access |

**Trigger:** `enforce_supplier_update_restrictions` — prevents suppliers from changing their own `status`, `commission_rate`, `approved_at`, `approved_by`, or `current_balance` *(added in 014)*.

#### supplier_documents

| Policy | Operation | Rule |
|--------|-----------|------|
| `supplier_documents_supplier_select` | SELECT | `supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())` — suppliers see their own documents |
| `supplier_documents_supplier_insert` | INSERT | `supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())` — suppliers upload their own documents |
| `supplier_documents_supplier_update` | UPDATE | `supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())` — suppliers can re-upload after rejection *(added in 014)* |
| `supplier_documents_admin_all` | ALL | `is_admin()` — admins have full access |

All supplier_documents policies were created/recreated in migration 014.

#### products

| Policy | Operation | Rule |
|--------|-----------|------|
| `products_select_active` | SELECT | `status = 'active' AND is_deleted = false` — any authenticated user sees active products |
| `products_supplier_select_own` | SELECT | `supplier_id = get_supplier_id()` — suppliers see all their own (including pending/rejected/needs_revision) |
| `products_supplier_insert` | INSERT | `supplier_id = get_supplier_id()` — suppliers create their own products |
| `products_supplier_update` | UPDATE | `supplier_id = get_supplier_id()` — suppliers edit their own products (also covers soft-delete via `is_deleted=true`) |
| `products_admin_all` | ALL | `is_admin()` — admins have full access |

**Note:** Redundant `products_supplier_delete` policy (identical to `products_supplier_update`) was removed in migration 017. All policies were idempotently re-declared in migration 017.

#### carts

| Policy | Operation | Rule |
|--------|-----------|------|
| `carts_customer_crud` | ALL | `customer_id = auth.uid()` — customers fully manage their own carts |
| `carts_admin_all` | ALL | `is_admin()` — admins have full access *(upgraded from SELECT-only in 014)* |

#### cart_items

| Policy | Operation | Rule |
|--------|-----------|------|
| `cart_items_customer_crud` | ALL | `cart_id IN (SELECT id FROM carts WHERE customer_id = auth.uid())` — customers manage items in their own carts |
| `cart_items_admin_all` | ALL | `is_admin()` — admins have full access *(upgraded from SELECT-only in 014)* |

#### orders

| Policy | Operation | Rule |
|--------|-----------|------|
| `orders_customer_select` | SELECT | `customer_id = auth.uid() AND parent_order_id IS NULL` — customers see master orders only |
| `orders_supplier_select` | SELECT | `supplier_id = get_supplier_id() AND parent_order_id IS NOT NULL` — suppliers see their sub-orders only |
| `orders_admin_all` | ALL | `is_admin()` — admins have full access |

#### order_items

| Policy | Operation | Rule |
|--------|-----------|------|
| `order_items_customer_select` | SELECT | `order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())` — customers see items in their orders |
| `order_items_supplier_select` | SELECT | `supplier_id = get_supplier_id()` — suppliers see items assigned to them |
| `order_items_admin_all` | ALL | `is_admin()` — admins have full access |

#### payments

| Policy | Operation | Rule |
|--------|-----------|------|
| `payments_customer_select` | SELECT | `order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())` — customers see payments for their orders |
| `payments_admin_all` | ALL | `is_admin()` — admins have full access |

**No supplier access** — suppliers cannot see payment data.

#### commissions

| Policy | Operation | Rule |
|--------|-----------|------|
| `commissions_supplier_select` | SELECT | `supplier_id = get_supplier_id()` — suppliers see their own commissions |
| `commissions_admin_all` | ALL | `is_admin()` — admins have full access |

**No customer access** — customers cannot see commission data.

#### payouts

| Policy | Operation | Rule |
|--------|-----------|------|
| `payouts_supplier_select` | SELECT | `supplier_id = get_supplier_id()` — suppliers see their own payouts |
| `payouts_admin_all` | ALL | `is_admin()` — admins have full access |

**No customer access** — customers cannot see payout data.

#### stock_audit_log

| Policy | Operation | Rule |
|--------|-----------|------|
| `stock_audit_supplier_select` | SELECT | `supplier_id = get_supplier_id()` — suppliers see audit logs for their own products |
| `stock_audit_admin_all` | ALL | `is_admin()` — admins have full access |

**No customer access** — customers cannot see stock audit logs.

### Cross-Tenant Access Prevention Summary

| Data | Customer | Supplier | Admin |
|------|----------|----------|-------|
| Own user profile | Read/Update | Read/Update | Full |
| Other user profiles | No | No | Full |
| Supplier profile | No | Own only (R/U/Insert) | Full |
| Supplier documents | No | Own only (R/Insert/Update) | Full |
| Products (active) | Read | Read | Full |
| Products (pending/rejected) | No | Own only | Full |
| Products (create/edit) | No | Own only | Full |
| Carts | Own only (CRUD) | No | Full |
| Cart items | Own only (CRUD) | No | Full |
| Orders (master) | Own only (Read) | No | Full |
| Orders (sub-orders) | No | Own only (Read) | Full |
| Order items | Own orders (Read) | Own items (Read) | Full |
| Payments | Own orders (Read) | **No access** | Full |
| Commissions | **No access** | Own only (Read) | Full |
| Payouts | **No access** | Own only (Read) | Full |
| Stock audit log | **No access** | Own only (Read) | Full |

---

## Database Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `update_updated_at_column()` | TRIGGER | Auto-updates `updated_at` timestamp on row update |
| `get_current_user_id()` | UUID | Returns `auth.uid()::uuid` |
| `get_current_user_role()` | VARCHAR | Looks up role from users table for current auth user |
| `is_admin()` | BOOLEAN | Returns true if current user's role = 'admin' |
| `get_supplier_id()` | UUID | Returns the supplier.id for the current auth user |
| `prevent_supplier_self_approval()` | TRIGGER | Prevents suppliers from changing status, commission_rate, approved_at, approved_by, current_balance |
| `lock_products_for_update(product_ids UUID[])` | TABLE(id UUID, stock_quantity INTEGER) | SELECT ... FOR UPDATE with deterministic lock ordering to prevent deadlocks. Used by inventory management and checkout stock decrement. |

---

## Migration Files

| File | Purpose |
|------|---------|
| 000_extensions.sql | Enable uuid-ossp extension, create `update_updated_at_column()` trigger function |
| 001_create_users.sql | Users table + trigger |
| 002_create_suppliers.sql | Suppliers table + trigger |
| 003_create_products.sql | Products table + trigger |
| 004_create_carts.sql | Carts table + trigger |
| 005_create_cart_items.sql | Cart items table + trigger |
| 006_create_orders.sql | Orders table + trigger |
| 007_create_order_items.sql | Order items table + trigger |
| 008_create_payments.sql | Payments table + trigger |
| 009_create_commissions.sql | Commissions table + trigger |
| 010_create_payouts.sql | Payouts table + trigger |
| 011_create_indexes.sql | All performance indexes |
| 012_create_rls_policies.sql | RLS helper functions, enable RLS on all tables, all access policies |
| 013_align_supplier_schema.sql | Align supplier schema: alter suppliers (JSONB address, percentage commission_rate, new columns), create supplier_documents, add shipping columns to order_items, update commissions (rename payout_status → status, add supplier_amount), add payout columns |
| 014_fix_rls_policy_gaps.sql | Fix 4 RLS gaps: suppliers_insert_own, supplier_documents full policies, prevent_supplier_self_approval trigger, admin full access on carts/cart_items |
| 017_audit_rls_supplier_products.sql | Update products status CHECK constraint (pending/active/inactive/rejected/needs_revision), remove redundant products_supplier_delete policy, idempotently re-declare all product policies |
| 018_supplier_inventory.sql | Add low_stock_threshold + last_restocked_at to products, create stock_audit_log table with RLS, create lock_products_for_update() function |
| 019_product_approval_workflow.sql | Add reviewed_by, reviewed_at, admin_feedback to products, add idx_products_status_created index |
