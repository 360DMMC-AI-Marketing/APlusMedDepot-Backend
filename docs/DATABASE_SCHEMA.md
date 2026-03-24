# Database Schema

## Overview
Final schema derived from numbered migrations `000` through `030` (31 files).

## Global Database Objects

### Extensions
- `uuid-ossp`

### Enum Types
- `order_status`: `pending_payment`, `payment_processing`, `payment_confirmed`, `awaiting_fulfillment`, `partially_shipped`, `fully_shipped`, `delivered`, `cancelled`, `refunded`
- `payment_status` (type exists, but `orders.payment_status` remains `VARCHAR`)
- `fulfillment_status` (type exists, but `order_items.fulfillment_status` remains `VARCHAR`)

### Shared Functions
- `update_updated_at_column()` trigger function
- `get_current_user_id()`
- `get_current_user_role()`
- `is_admin()`
- `get_supplier_id()`
- `lock_products_for_update(product_ids UUID[])`
- `increment_supplier_balance(p_supplier_id UUID, p_amount NUMERIC)`
- `deduct_credit(p_user_id UUID, p_amount NUMERIC)`
- `restore_credit(p_user_id UUID, p_amount NUMERIC)`
- `prevent_supplier_self_approval()`

## Tables

## 1) `users`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `email` | `VARCHAR` | UNIQUE, NOT NULL |
| `password_hash` | `VARCHAR` | NOT NULL |
| `first_name` | `VARCHAR` | NOT NULL |
| `last_name` | `VARCHAR` | NOT NULL |
| `company_name` | `VARCHAR` | nullable |
| `phone` | `VARCHAR` | nullable |
| `role` | `VARCHAR` | NOT NULL, CHECK in (`customer`, `supplier`, `admin`) |
| `status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `approved`, `suspended`, `rejected`) |
| `last_login` | `TIMESTAMPTZ` | nullable |
| `email_verified` | `BOOLEAN` | NOT NULL, default `false` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- none

### Indexes
- `idx_users_email` on (`email`)
- `idx_users_role` on (`role`)
- `idx_users_status` on (`status`)

### Triggers
- `set_users_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `users_select_own` (SELECT where `id = auth.uid()`)
- `users_update_own` (UPDATE own row)
- `users_admin_all` (ALL for admins)

## 2) `suppliers`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `user_id` | `UUID` | UNIQUE, NOT NULL, FK -> `users(id)` ON DELETE CASCADE |
| `business_name` | `VARCHAR` | NOT NULL |
| `tax_id` | `VARCHAR` | nullable |
| `business_type` | `VARCHAR(100)` | nullable |
| `address` | `JSONB` | default `'{}'::jsonb` |
| `phone` | `VARCHAR` | nullable |
| `contact_name` | `VARCHAR(255)` | nullable |
| `contact_email` | `VARCHAR(255)` | nullable |
| `commission_rate` | `NUMERIC(5,2)` | NOT NULL, default `10`, CHECK `>= 0 AND <= 100` |
| `status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `under_review`, `approved`, `rejected`, `needs_revision`, `suspended`) |
| `bank_account_info` | `JSONB` | default `'{}'::jsonb` |
| `product_categories` | `TEXT[]` | nullable |
| `rejection_reason` | `TEXT` | nullable |
| `current_balance` | `NUMERIC(12,2)` | NOT NULL, default `0.00` |
| `years_in_business` | `INTEGER` | nullable |
| `approved_at` | `TIMESTAMPTZ` | nullable |
| `approved_by` | `UUID` | nullable, FK -> `users(id)` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `user_id` -> `users(id)` ON DELETE CASCADE
- `approved_by` -> `users(id)`

### Indexes
- `idx_suppliers_user_id` on (`user_id`)
- `idx_suppliers_status` on (`status`)
- `idx_suppliers_business_name` on (`business_name`)
- `idx_suppliers_created_at` on (`created_at` DESC)

### Triggers
- `set_suppliers_updated_at` -> `update_updated_at_column()`
- `enforce_supplier_update_restrictions` -> `prevent_supplier_self_approval()`

### RLS
- Enabled
- `suppliers_select_own`
- `suppliers_update_own`
- `suppliers_insert_own`
- `suppliers_admin_all`

## 3) `supplier_documents`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `supplier_id` | `UUID` | NOT NULL, FK -> `suppliers(id)` ON DELETE CASCADE |
| `document_type` | `VARCHAR(50)` | NOT NULL, CHECK in (`business_license`, `insurance_certificate`, `tax_document`, `w9`, `other`) |
| `file_name` | `VARCHAR(255)` | NOT NULL |
| `file_size` | `INTEGER` | nullable |
| `mime_type` | `VARCHAR(100)` | nullable |
| `storage_path` | `TEXT` | NOT NULL |
| `status` | `VARCHAR(20)` | NOT NULL, default `pending`, CHECK in (`pending`, `approved`, `rejected`) |
| `rejection_reason` | `TEXT` | nullable |
| `review_notes` | `TEXT` | nullable |
| `uploaded_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `reviewed_at` | `TIMESTAMPTZ` | nullable |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `supplier_id` -> `suppliers(id)` ON DELETE CASCADE

### Indexes
- `idx_supplier_docs_supplier_id` on (`supplier_id`)
- `idx_supplier_docs_type` on (`document_type`)
- `idx_supplier_docs_status` on (`status`)

### Triggers
- `set_supplier_documents_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `supplier_documents_supplier_select`
- `supplier_documents_supplier_insert`
- `supplier_documents_supplier_update`
- `supplier_documents_admin_all`

## 4) `products`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `supplier_id` | `UUID` | NOT NULL, FK -> `suppliers(id)` ON DELETE CASCADE |
| `name` | `VARCHAR` | NOT NULL |
| `description` | `TEXT` | nullable |
| `sku` | `VARCHAR` | UNIQUE, NOT NULL |
| `price` | `DECIMAL(10,2)` | NOT NULL, CHECK `price > 0` |
| `original_price` | `NUMERIC(10,2)` | nullable |
| `stock_quantity` | `INTEGER` | NOT NULL, default `0`, CHECK `stock_quantity >= 0` |
| `low_stock_threshold` | `INTEGER` | NOT NULL, default `10` |
| `last_restocked_at` | `TIMESTAMPTZ` | nullable |
| `category` | `VARCHAR` | nullable |
| `status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `active`, `inactive`, `rejected`, `needs_revision`) |
| `images` | `JSONB` | default `'[]'` |
| `specifications` | `JSONB` | default `'{}'` |
| `weight` | `DECIMAL(8,2)` | nullable |
| `dimensions` | `JSONB` | nullable |
| `is_deleted` | `BOOLEAN` | default `false` |
| `is_featured` | `BOOLEAN` | default `false` |
| `reviewed_by` | `UUID` | nullable, FK -> `users(id)` |
| `reviewed_at` | `TIMESTAMPTZ` | nullable |
| `admin_feedback` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `supplier_id` -> `suppliers(id)` ON DELETE CASCADE
- `reviewed_by` -> `users(id)`

### Indexes
- `idx_products_supplier_id` on (`supplier_id`)
- `idx_products_category` on (`category`)
- `idx_products_status` on (`status`)
- `idx_products_sku` on (`sku`)
- `idx_products_is_deleted` on (`is_deleted`)
- `idx_products_search` GIN on `to_tsvector('english', name)`
- `idx_products_status_created` on (`status`, `created_at` ASC)
- `idx_products_is_featured` partial index on (`is_featured`) where `is_featured = true`

### Triggers
- `set_products_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `products_select_active`
- `products_supplier_select_own`
- `products_supplier_insert`
- `products_supplier_update`
- `products_admin_all`

## 5) `carts`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `customer_id` | `UUID` | NOT NULL, FK -> `users(id)` |
| `status` | `VARCHAR` | NOT NULL, default `active`, CHECK in (`active`, `converted`, `abandoned`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `customer_id` -> `users(id)`

### Indexes
- `idx_carts_customer_active` partial index on (`customer_id`) where `status = 'active'`

### Triggers
- `set_carts_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `carts_customer_crud`
- `carts_admin_all`

## 6) `cart_items`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `cart_id` | `UUID` | NOT NULL, FK -> `carts(id)` ON DELETE CASCADE |
| `product_id` | `UUID` | NOT NULL, FK -> `products(id)` |
| `quantity` | `INTEGER` | NOT NULL, CHECK `quantity > 0` |
| `unit_price` | `DECIMAL(10,2)` | NOT NULL, CHECK `unit_price > 0` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### Constraints
- UNIQUE (`cart_id`, `product_id`)

### FKs
- `cart_id` -> `carts(id)` ON DELETE CASCADE
- `product_id` -> `products(id)`

### Triggers
- `set_cart_items_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `cart_items_customer_crud`
- `cart_items_admin_all`

## 7) `orders`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `order_number` | `VARCHAR` | UNIQUE, NOT NULL |
| `customer_id` | `UUID` | NOT NULL, FK -> `users(id)` |
| `parent_order_id` | `UUID` | nullable, FK -> `orders(id)` |
| `supplier_id` | `UUID` | nullable, FK -> `suppliers(id)` |
| `total_amount` | `DECIMAL(10,2)` | NOT NULL |
| `tax_amount` | `DECIMAL(10,2)` | NOT NULL, default `0` |
| `shipping_address` | `JSONB` | NOT NULL |
| `status` | `order_status` | NOT NULL, default `pending_payment` |
| `payment_status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `processing`, `paid`, `failed`, `refunded`, `partially_refunded`) |
| `payment_intent_id` | `VARCHAR` | nullable |
| `paypal_order_id` | `VARCHAR(255)` | nullable |
| `payment_method` | `VARCHAR(20)` | nullable (`stripe`, `paypal`, `net30`) |
| `notes` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `customer_id` -> `users(id)`
- `parent_order_id` -> `orders(id)`
- `supplier_id` -> `suppliers(id)`

### Indexes
- `idx_orders_customer_id` on (`customer_id`)
- `idx_orders_parent_order_id` on (`parent_order_id`)
- `idx_orders_supplier_id` on (`supplier_id`)
- `idx_orders_status` on (`status`)
- `idx_orders_order_number` on (`order_number`)
- `idx_orders_payment_status` on (`payment_status`)
- `idx_orders_customer_status` on (`customer_id`, `status`)
- `idx_orders_payment_intent_id` UNIQUE partial on (`payment_intent_id`) where not null
- `idx_orders_paypal_order_id` partial on (`paypal_order_id`) where not null

### Triggers
- `set_orders_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `orders_customer_select`
- `orders_supplier_select`
- `orders_admin_all`

## 8) `order_items`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `order_id` | `UUID` | NOT NULL, FK -> `orders(id)` ON DELETE CASCADE |
| `product_id` | `UUID` | NOT NULL, FK -> `products(id)` |
| `supplier_id` | `UUID` | NOT NULL, FK -> `suppliers(id)` |
| `quantity` | `INTEGER` | NOT NULL, CHECK `quantity > 0` |
| `unit_price` | `DECIMAL(10,2)` | NOT NULL |
| `subtotal` | `DECIMAL(10,2)` | NOT NULL |
| `fulfillment_status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`) |
| `tracking_number` | `VARCHAR(100)` | nullable |
| `carrier` | `VARCHAR(50)` | nullable |
| `shipped_at` | `TIMESTAMPTZ` | nullable |
| `delivered_at` | `TIMESTAMPTZ` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `order_id` -> `orders(id)` ON DELETE CASCADE
- `product_id` -> `products(id)`
- `supplier_id` -> `suppliers(id)`

### Indexes
- `idx_order_items_order_id` on (`order_id`)
- `idx_order_items_supplier_id` on (`supplier_id`)
- `idx_order_items_product_id` on (`product_id`)
- `idx_order_items_fulfillment_status` on (`fulfillment_status`)

### Triggers
- `set_order_items_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `order_items_customer_select`
- `order_items_supplier_select`
- `order_items_admin_all`

## 9) `order_status_history`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `order_id` | `UUID` | NOT NULL, FK -> `orders(id)` ON DELETE CASCADE |
| `from_status` | `order_status` | nullable |
| `to_status` | `order_status` | NOT NULL |
| `changed_by` | `UUID` | NOT NULL, FK -> `users(id)` |
| `reason` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `order_id` -> `orders(id)` ON DELETE CASCADE
- `changed_by` -> `users(id)`

### Indexes
- `idx_order_status_history_order_id` on (`order_id`)

### RLS
- Enabled
- `order_status_history_customer_select`
- `order_status_history_supplier_select`
- `order_status_history_admin_all`

## 10) `payments`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `order_id` | `UUID` | NOT NULL, FK -> `orders(id)` |
| `stripe_payment_intent_id` | `VARCHAR` | UNIQUE, NOT NULL |
| `amount` | `DECIMAL(10,2)` | NOT NULL |
| `currency` | `VARCHAR` | NOT NULL, default `usd` |
| `status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `processing`, `succeeded`, `failed`, `refunded`, `partially_refunded`) |
| `stripe_charge_id` | `VARCHAR` | nullable |
| `failure_reason` | `TEXT` | nullable |
| `metadata` | `JSONB` | default `'{}'` |
| `payment_method` | `VARCHAR(50)` | nullable |
| `paid_at` | `TIMESTAMPTZ` | nullable |
| `stripe_event_id` | `VARCHAR(255)` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `order_id` -> `orders(id)`

### Indexes
- `idx_payments_order_id` on (`order_id`)
- `idx_payments_stripe_payment_intent_id` on (`stripe_payment_intent_id`)
- `idx_payments_status` on (`status`)

### Triggers
- `set_payments_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `payments_customer_select`
- `payments_admin_all`

## 11) `commissions`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `order_item_id` | `UUID` | UNIQUE, NOT NULL, FK -> `order_items(id)` |
| `supplier_id` | `UUID` | NOT NULL, FK -> `suppliers(id)` |
| `order_id` | `UUID` | nullable, FK -> `orders(id)` |
| `sale_amount` | `DECIMAL(10,2)` | NOT NULL |
| `commission_rate` | `NUMERIC(5,2)` | NOT NULL, CHECK `>= 0 AND <= 100` |
| `commission_amount` | `DECIMAL(10,2)` | NOT NULL |
| `platform_amount` | `DECIMAL(10,2)` | NOT NULL |
| `supplier_payout` | `DECIMAL(10,2)` | NOT NULL |
| `supplier_amount` | `NUMERIC(12,2)` | nullable |
| `status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `confirmed`, `paid`, `cancelled`, `reversed`) |
| `confirmed_at` | `TIMESTAMPTZ` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `order_item_id` -> `order_items(id)`
- `supplier_id` -> `suppliers(id)`
- `order_id` -> `orders(id)`

### Indexes
- `idx_commissions_supplier_id` on (`supplier_id`)
- `idx_commissions_payout_status` (legacy name; now indexed `status` column)

### Triggers
- `set_commissions_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `commissions_supplier_select`
- `commissions_admin_all`

## 12) `payouts`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `supplier_id` | `UUID` | NOT NULL, FK -> `suppliers(id)` |
| `amount` | `DECIMAL(10,2)` | NOT NULL |
| `commission_total` | `DECIMAL(10,2)` | NOT NULL |
| `period_start` | `DATE` | NOT NULL |
| `period_end` | `DATE` | NOT NULL |
| `payout_date` | `DATE` | nullable |
| `status` | `VARCHAR` | NOT NULL, default `pending`, CHECK in (`pending`, `processing`, `completed`, `failed`) |
| `is_early_payout` | `BOOLEAN` | default `false` |
| `early_payout_fee` | `DECIMAL(10,2)` | default `0` |
| `transaction_ref` | `VARCHAR` | nullable |
| `invoice_url` | `VARCHAR` | nullable |
| `items_count` | `INTEGER` | NOT NULL, default `0` |
| `payout_method` | `VARCHAR(50)` | default `ach_transfer` |
| `scheduled_at` | `TIMESTAMPTZ` | nullable |
| `processed_at` | `TIMESTAMPTZ` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `supplier_id` -> `suppliers(id)`

### Indexes
- `idx_payouts_supplier_id` on (`supplier_id`)
- `idx_payouts_status` on (`status`)
- `idx_payouts_payout_date` on (`payout_date`)

### Triggers
- `set_payouts_updated_at` -> `update_updated_at_column()`

### RLS
- Enabled
- `payouts_supplier_select`
- `payouts_admin_all`

## 13) `stock_audit_log`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `product_id` | `UUID` | NOT NULL, FK -> `products(id)` ON DELETE CASCADE |
| `supplier_id` | `UUID` | NOT NULL, FK -> `suppliers(id)` ON DELETE CASCADE |
| `old_quantity` | `INTEGER` | NOT NULL |
| `new_quantity` | `INTEGER` | NOT NULL |
| `change_source` | `VARCHAR(50)` | NOT NULL, default `supplier_update`, CHECK in (`supplier_update`, `bulk_update`, `order_decrement`, `order_refund`) |
| `changed_by` | `UUID` | nullable, FK -> `users(id)` |
| `changed_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `product_id` -> `products(id)` ON DELETE CASCADE
- `supplier_id` -> `suppliers(id)` ON DELETE CASCADE
- `changed_by` -> `users(id)`

### Indexes
- `idx_stock_audit_product_id` on (`product_id`)
- `idx_stock_audit_supplier_id` on (`supplier_id`)
- `idx_stock_audit_changed_at` on (`changed_at` DESC)

### RLS
- Enabled
- `stock_audit_supplier_select`
- `stock_audit_admin_all`

## 14) `notifications`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `user_id` | `UUID` | NOT NULL, FK -> `users(id)` ON DELETE CASCADE |
| `type` | `VARCHAR(50)` | NOT NULL |
| `title` | `VARCHAR(255)` | NOT NULL |
| `message` | `TEXT` | NOT NULL |
| `data` | `JSONB` | default `'{}'` |
| `read` | `BOOLEAN` | default `false` |
| `email_sent` | `BOOLEAN` | default `false` |
| `created_at` | `TIMESTAMPTZ` | default `now()` |

### FKs
- `user_id` -> `users(id)` ON DELETE CASCADE

### Indexes
- `idx_notifications_user_id` on (`user_id`)
- `idx_notifications_read` partial on (`user_id`, `read`) where `read = false`
- `idx_notifications_created_at` on (`created_at` DESC)

### RLS
- Enabled
- `notifications_own` (`FOR ALL TO authenticated USING (user_id = auth.uid())`)
- `notifications_service` (`FOR ALL TO service_role`)

## 15) `audit_logs`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `admin_id` | `UUID` | NOT NULL, FK -> `users(id)` |
| `action` | `TEXT` | NOT NULL |
| `resource_type` | `TEXT` | NOT NULL |
| `resource_id` | `TEXT` | nullable |
| `details` | `JSONB` | default `'{}'` |
| `ip_address` | `TEXT` | nullable |
| `user_agent` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` |

### FKs
- `admin_id` -> `users(id)`

### Indexes
- `idx_audit_logs_admin_id` on (`admin_id`)
- `idx_audit_logs_resource` on (`resource_type`, `resource_id`)
- `idx_audit_logs_created_at` on (`created_at` DESC)
- `idx_audit_logs_action` on (`action`)

### RLS
- Enabled
- `service_role_full_access` (`FOR ALL USING (true) WITH CHECK (true)`)

## 16) `password_reset_tokens`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `user_id` | `UUID` | NOT NULL, FK -> `users(id)` ON DELETE CASCADE |
| `token` | `TEXT` | NOT NULL, UNIQUE |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL |
| `used` | `BOOLEAN` | NOT NULL, default `false` |
| `created_at` | `TIMESTAMPTZ` | default `now()` |

### FKs
- `user_id` -> `users(id)` ON DELETE CASCADE

### Indexes
- `idx_password_reset_tokens_token` on (`token`)
- `idx_password_reset_tokens_user_id` on (`user_id`)
- `idx_password_reset_tokens_expires` on (`expires_at`)

### RLS
- Enabled
- `password_reset_tokens_service_all` (`FOR ALL TO service_role`)

## 17) `email_verification_tokens`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `user_id` | `UUID` | NOT NULL, FK -> `users(id)` ON DELETE CASCADE |
| `token` | `TEXT` | NOT NULL, UNIQUE |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL |
| `used` | `BOOLEAN` | NOT NULL, default `false` |
| `created_at` | `TIMESTAMPTZ` | default `now()` |

### FKs
- `user_id` -> `users(id)` ON DELETE CASCADE

### Indexes
- `idx_email_verification_tokens_token` on (`token`)
- `idx_email_verification_tokens_user_id` on (`user_id`)

### RLS
- Enabled
- `email_verification_tokens_service_all` (`FOR ALL TO service_role`)

## 18) `user_credit`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `user_id` | `UUID` | NOT NULL, UNIQUE, FK -> `users(id)` ON DELETE CASCADE |
| `credit_limit` | `NUMERIC(12,2)` | NOT NULL, default `50000.00` |
| `credit_used` | `NUMERIC(12,2)` | NOT NULL, default `0.00` |
| `eligible` | `BOOLEAN` | NOT NULL, default `false` |
| `updated_at` | `TIMESTAMPTZ` | default `now()` |
| `created_at` | `TIMESTAMPTZ` | default `now()` |

### FKs
- `user_id` -> `users(id)` ON DELETE CASCADE

### Indexes
- `idx_user_credit_user_id` on (`user_id`)

### RLS
- Enabled
- `user_credit_service_all` (`FOR ALL TO service_role`)
- `user_credit_own_read` (`FOR SELECT TO authenticated`)

## 19) `invoices`

### Columns
| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `order_id` | `UUID` | NOT NULL, FK -> `orders(id)` ON DELETE CASCADE |
| `user_id` | `UUID` | NOT NULL, FK -> `users(id)` |
| `amount` | `NUMERIC(12,2)` | NOT NULL |
| `status` | `VARCHAR(20)` | NOT NULL, default `pending`, CHECK in (`pending`, `paid`, `overdue`, `cancelled`) |
| `due_date` | `TIMESTAMPTZ` | NOT NULL |
| `paid_at` | `TIMESTAMPTZ` | nullable |
| `created_at` | `TIMESTAMPTZ` | default `now()` |
| `updated_at` | `TIMESTAMPTZ` | default `now()` |

### FKs
- `order_id` -> `orders(id)` ON DELETE CASCADE
- `user_id` -> `users(id)`

### Indexes
- `idx_invoices_order_id` on (`order_id`)
- `idx_invoices_user_id` on (`user_id`)
- `idx_invoices_status` on (`status`)
- `idx_invoices_due_date` on (`due_date`)

### RLS
- Enabled
- `invoices_service_all` (`FOR ALL TO service_role`)
- `invoices_own_read` (`FOR SELECT TO authenticated`)

## Cross-Table Notes
- Most mutable tables use `updated_at` triggers from `update_updated_at_column()`.
- `orders`/`order_items`/`commissions`/`payouts` capture multi-vendor split-order commerce flows.
- Credit terms are implemented through `user_credit` + `invoices` and RPC helpers (`deduct_credit`, `restore_credit`).
- Stripe and PayPal linkage appears at order/payment level (`payment_intent_id`, `paypal_order_id`, `payment_method`, `payments.*`).
