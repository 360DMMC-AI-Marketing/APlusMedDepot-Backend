# Dev 2 Handoff Document — APlusMedDepot Backend

> Sprint 2 + Sprint 3 deliverables. This document covers all services, endpoints, database changes, and architectural decisions made by Dev 2 across both sprints.

---

## 1. Multi-Vendor Architecture Overview

### Master Orders vs Sub-Orders

The platform uses a **master + sub-order model**:

- **Master order** — created at checkout, has `parent_order_id = NULL` and `supplier_id = NULL`. This is what the customer sees.
- **Sub-orders** — one per supplier, have `parent_order_id = <masterOrderId>` and `supplier_id = <supplierId>`. These are what suppliers see in their portal.

### The Splitting Algorithm

Located in `src/services/orderSplitting.service.ts`:

1. Fetch master order and validate `parent_order_id IS NULL`
2. Fetch all `order_items` for the master order, joined with `suppliers(business_name)`
3. Group items by `supplier_id` using a `Map<string, { items, supplierName }>`
4. For each supplier group:
   - Generate order number: `SUB-{masterOrderNumber}-{index}`
   - Calculate subtotal (sum of item subtotals)
   - Calculate tax: `subtotal * 0.0825` (8.25% rate)
   - Calculate total: `subtotal + tax`
   - INSERT into `orders` with `parent_order_id = masterOrderId`
5. Return array of created sub-orders

### Why Sub-Orders Exist

- **Supplier portal isolation** — each supplier sees only their portion of an order
- **Independent fulfillment tracking** — items from different suppliers ship independently
- **Commission calculation** — commission is per-supplier, not per-order
- **Status independence** — one supplier can be "shipped" while another is "processing"

### Source of Truth

The **master order is always source of truth**. Sub-orders are supplementary views. Order items live on the master order (`order_items.order_id = masterOrderId`), not on sub-orders.

---

## 2. Commission Calculation Flow

### Trigger

Commissions are triggered by payment success via the hook in `src/services/hooks/paymentHooks.ts`:

```
Stripe webhook → payment_intent.succeeded → webhook.service.ts → onPaymentSuccess(orderId) → CommissionService.calculateOrderCommissions(orderId)
```

### Process

1. Fetch all `order_items` for the order, joined with `suppliers(commission_rate, business_name)`
2. For each item:
   - Get `ratePercent` from `suppliers.commission_rate` (stored as percentage, e.g. 15.00)
   - Convert to decimal: `rate = ratePercent / 100`
   - `commissionAmount = Math.round(saleAmount * rate * 100) / 100`
   - `supplierAmount = Math.round((saleAmount - commissionAmount) * 100) / 100`
   - `platformAmount = commissionAmount`
3. INSERT commission record into `commissions` table
4. Atomically increment supplier balance: `supabaseAdmin.rpc("increment_supplier_balance", { p_supplier_id, p_amount: supplierAmount })`

### Rounding Strategy

- All monetary amounts rounded to 2 decimal places via `Math.round(x * 100) / 100`
- **Penny-loss guard**: `sale_amount = commission_amount + supplier_payout` is always true
- Stress-tested with 100 random amounts (see `tests/unit/commission.accuracy.test.ts`)

### Reversal Flow

```
Stripe webhook → charge.refunded → webhook.service.ts → onPaymentRefunded(orderId) → CommissionService.reverseOrderCommissions(orderId)
```

1. Fetch all commissions for the order WHERE `status != 'reversed'`
2. For each commission:
   - UPDATE `status = 'reversed'`
   - Deduct from supplier balance: `rpc("increment_supplier_balance", { p_amount: -payoutAmount })`
   - The SQL function uses `GREATEST(balance + amount, 0)` to prevent negative balances

### Important DB Details

- `supplier_payout` is the **primary column** (NOT NULL) — this is the supplier's net earnings
- `supplier_amount` exists for compatibility (nullable) — set to the same value
- `commission_rate` is stored as **percentage** (15.00 = 15%), NOT a decimal fraction

---

## 3. Order Splitting Flow

### When It Runs

Called at approximately line 260 of `src/services/order.service.ts` after the master order and order items have been created during checkout.

### Algorithm Details

1. Groups items by `supplier_id`
2. Creates sub-orders with format `SUB-{masterNumber}-{index}` where index starts at 1
3. Each sub-order calculates its own tax independently: `subtotal * 0.0825`
4. Sub-order inherits `status` and `payment_status` from master order
5. Sub-order inherits `shipping_address` from master order

### Failure Handling

**Sub-order creation failure is non-fatal.** If a sub-order INSERT fails:
- Error is logged via `console.error`
- Processing continues for remaining suppliers
- Master order is NOT affected
- The system relies on eventual consistency — admin can manually resolve

---

## 4. Supplier Order Management

### How Suppliers See Orders

Suppliers access orders via `/api/suppliers/me/orders`:
- Only sub-orders are shown (WHERE `parent_order_id IS NOT NULL` AND `supplier_id = <theirId>`)
- Each order view includes commission breakdown (calculated from the supplier's `commission_rate`)
- Items are fetched from the **master order** filtered by `supplier_id`

### Fulfillment State Machine

```
pending → processing → shipped → delivered
```

- **No backward transitions** — a shipped item cannot go back to processing
- **Shipped requires** `trackingNumber` AND `carrier` (validated via Zod `.refine()`)
- **Carrier options**: USPS, UPS, FedEx, DHL, Other

### Master Order Auto-Update

After any item fulfillment update, `checkAndUpdateMasterOrderStatus()` evaluates all items:

| Condition | Master Status |
|-----------|--------------|
| ALL items delivered | `delivered` |
| ALL items shipped or delivered | `fully_shipped` |
| SOME items shipped or delivered | `partially_shipped` |

A status history record is inserted for audit trail.

### Shipping Notification

When an item status changes to `shipped`, a fire-and-forget email is sent to the customer via `sendShippingNotification()` with product name, quantity, carrier, and tracking number.

---

## 5. Payout System

### Balance Tracking

- Supplier balance stored in `suppliers.current_balance` (NUMERIC(12,2))
- Protected by `enforce_supplier_update_restrictions` trigger — suppliers cannot modify their own balance
- Incremented atomically via `increment_supplier_balance` RPC function
- Balance is **credit-side only**: reflects commissions earned minus payouts processed

### Balance Increment

The `increment_supplier_balance(p_supplier_id, p_amount)` PostgreSQL function:
- Positive amount = credit (commission earned)
- Negative amount = debit (payout or reversal)
- Uses `GREATEST(current_balance + p_amount, 0)` to prevent negative balances

### Payout Rules

| Rule | Value |
|------|-------|
| Minimum threshold | $50 |
| Payout schedule | 15th of each month |
| Early payout fee | 2.5% |
| Default method | ACH bank transfer |

### Payout Flow

1. Admin creates payout via `POST /api/admin/payouts`
2. Service verifies `current_balance >= amount` (throws 409 CONFLICT if insufficient)
3. INSERT into `payouts` table with status `pending`
4. Atomically deduct from supplier balance via `increment_supplier_balance(supplierId, -amount)`

### Reports

Suppliers can generate period-based reports via `GET /api/suppliers/me/payouts/report?start=...&end=...`:
- Returns commissions grouped by order, with per-item breakdown
- Includes product names, quantities, commission rates, and payout amounts
- Summary with total sales, total commission, total payout, order count

---

## 6. API Endpoint Reference

### Supplier Product Management

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers/products` | supplier | List own products (filtering, pagination) |
| GET | `/api/suppliers/products/stats` | supplier | Aggregate stats (counts, inventory value) |
| POST | `/api/suppliers/products` | supplier | Create product (status: pending) |
| PUT | `/api/suppliers/products/:id` | supplier | Update product (restricted fields if active) |
| DELETE | `/api/suppliers/products/:id` | supplier | Soft delete product |
| POST | `/api/suppliers/products/:id/images` | supplier | Upload image (max 5, 5MB) |
| DELETE | `/api/suppliers/products/:id/images/:imageIndex` | supplier | Delete specific image |
| GET | `/api/suppliers/products/:id/analytics` | supplier | Per-product sales analytics |

### Supplier Inventory

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers/inventory` | supplier | List inventory with low-stock summary |
| PUT | `/api/suppliers/inventory/:productId` | supplier | Update stock (SELECT FOR UPDATE) |
| POST | `/api/suppliers/inventory/bulk-update` | supplier | Bulk stock update (max 50, all-or-nothing) |
| GET | `/api/suppliers/inventory/low-stock` | supplier | Products at/below threshold |

### Supplier Order Management

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers/me/orders` | supplier | List sub-orders with commission breakdown |
| GET | `/api/suppliers/me/orders/stats` | supplier | Order counts, revenue, status breakdown |
| GET | `/api/suppliers/me/orders/:id` | supplier | Full order detail with items and history |
| PUT | `/api/suppliers/me/orders/items/:itemId/fulfillment` | supplier | Update item fulfillment status |

### Commission Tracking

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/commissions` | supplier | List own commissions (date/status filters) |
| GET | `/api/commissions/summary` | supplier | Aggregated commission totals |
| GET | `/api/commissions/order/:orderId` | admin | View commissions for specific order |
| GET | `/api/commissions/supplier/:supplierId` | admin | View commissions for specific supplier |

### Payout Tracking

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers/me/payouts/balance` | supplier | Current balance and availability |
| GET | `/api/suppliers/me/payouts/history` | supplier | Paginated payout records (DESC) |
| GET | `/api/suppliers/me/payouts/summary` | supplier | Month-over-month earnings, threshold |
| GET | `/api/suppliers/me/payouts/report` | supplier | Period-based payout report with order breakdown |
| POST | `/api/admin/payouts` | admin | Create payout record, deduct balance |

### Supplier Analytics

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers/analytics/products` | supplier | Aggregate analytics (top 5 by quantity) |
| GET | `/api/suppliers/analytics/dashboard` | supplier | Revenue MoM, order counts, active products |
| GET | `/api/suppliers/analytics/top-products` | supplier | Top N products by revenue |
| GET | `/api/suppliers/analytics/revenue-trend` | supplier | Revenue over time (daily/weekly buckets) |
| GET | `/api/suppliers/analytics/order-status` | supplier | Order counts by status bucket |

### Admin Product Approval

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/products/pending` | admin | Paginated pending products |
| GET | `/api/admin/products/:id/review` | admin | Product detail + supplier + review history |
| PUT | `/api/admin/products/:id/approve` | admin | Approve -> active, sends email |
| PUT | `/api/admin/products/:id/request-changes` | admin | Needs revision, sends email |
| PUT | `/api/admin/products/:id/reject` | admin | Reject, sends email with reason |

### Admin Supplier Management

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/suppliers` | admin | List suppliers (status/search/pagination) |
| GET | `/api/admin/suppliers/commissions` | admin | Commission report with aggregates |
| GET | `/api/admin/suppliers/:id` | admin | Supplier details with documents |
| PUT | `/api/admin/suppliers/:id/approve` | admin | Approve application (optional commission rate) |
| PUT | `/api/admin/suppliers/:id/reject` | admin | Reject application (requires reason) |
| PUT | `/api/admin/suppliers/:id/request-revision` | admin | Request revision on application |
| PUT | `/api/admin/suppliers/:id/review` | admin | Move from pending to under review |

---

## 7. Database Changes (Dev 2 Migrations)

| Migration | Purpose |
|-----------|---------|
| **014** `fix_rls_policy_gaps.sql` | Fix 4 RLS gaps: `suppliers_insert_own`, supplier_documents full policies, `prevent_supplier_self_approval` trigger, admin full access on carts/cart_items |
| **017** `audit_rls_supplier_products.sql` | Update products status CHECK (pending/active/inactive/rejected/needs_revision), remove redundant `products_supplier_delete` policy |
| **018** `supplier_inventory.sql` | Add `low_stock_threshold` + `last_restocked_at` to products, create `stock_audit_log` table with RLS, create `lock_products_for_update()` function |
| **019** `product_approval_workflow.sql` | Add `reviewed_by`, `reviewed_at`, `admin_feedback` to products, add `idx_products_status_created` index |
| **020** `sprint3_prep.sql` | Add `payment_method`, `paid_at`, `stripe_event_id` to payments; add `order_id` to commissions; fix `payment_status` constraint to use 'paid' |
| **021** `commission_functions.sql` | Add 'reversed' to commissions status constraint; create `increment_supplier_balance` RPC function (atomic, GREATEST(0) guard) |

---

## 8. Known Limitations

1. **No partial refund commission handling** — only full refund reversal is implemented. `reverseOrderCommissions` reverses ALL non-reversed commissions for an order.

2. **Commission rates stored as percentage** — `commission_rate` in the DB is NUMERIC(5,2) where 15.00 = 15%. The service divides by 100 internally. Do not change this convention.

3. **Dual payout columns** — `supplier_payout` is the primary column (NOT NULL). `supplier_amount` exists for backward compatibility and is set to the same value. Use `supplier_payout` for queries.

4. **Sub-order creation is non-fatal** — if a sub-order INSERT fails, the error is logged but the master order is unaffected. This is by design for resilience but means sub-orders can be out of sync until manually corrected.

5. **Payout records only** — the payout system tracks records and deducts balances but does not integrate with actual bank transfer APIs (ACH, wire, etc.). This is a future integration point.

6. **Analytics query performance** — analytics endpoints aggregate data in application code (not materialized views). For very large datasets, these queries may become slow. Consider adding materialized views or pre-computed aggregation tables if performance becomes an issue.

7. **No order item-level refunds** — refunds are at the order level only. There is no API to refund a single item within an order.

8. **Commission not recalculated on price changes** — once commissions are calculated at payment time, they are fixed. If an admin changes a supplier's commission rate, it only affects future orders.

---

## 9. Edge Cases Documented

| Edge Case | Behavior |
|-----------|----------|
| Supplier with 0% commission rate | Full sale amount goes to supplier, $0 commission recorded |
| Single-supplier order | Still creates 1 sub-order (consistent model for supplier portal) |
| Zero-dollar item ($0.00 subtotal) | Zero commission recorded, no division errors, no balance increment |
| Sub-order creation DB failure | Logged via `console.error`, master order unaffected, processing continues for other suppliers |
| Double commission reversal | Prevented by `WHERE status != 'reversed'` filter — idempotent |
| Supplier balance going negative | Prevented by `GREATEST(balance + amount, 0)` in `increment_supplier_balance` |
| Supplier with NULL commission_rate | Falls back to `DEFAULT_COMMISSION_RATE` (15%) |
| Item shipped without tracking info | Rejected by Zod validation (`.refine()` requires trackingNumber + carrier when status is 'shipped') |
| Backward fulfillment transition | Rejected with 409 CONFLICT (e.g., shipped -> processing is not in `validTransitions` map) |
| Balance below $50 payout threshold | `availableForPayout` returns 0 (balance is shown but not available) |
| Payout amount exceeds balance | Throws 409 CONFLICT ("Insufficient balance for payout") |

---

## 10. What Dev 1 Should NOT Touch

These components are heavily tested and penny-precise. Modifications risk breaking financial accuracy:

1. **Commission calculation logic** in `CommissionService.calculateOrderCommissions` — the rounding math (`Math.round(x * 100) / 100`) is validated by 100-amount stress test

2. **Order splitting algorithm** in `splitOrderBySupplier` — the grouping, tax calculation, and sub-order creation flow

3. **`increment_supplier_balance` RPC function** (migration 021) — the `GREATEST(0)` guard prevents negative balances

4. **Payment hooks wiring** in `src/services/hooks/paymentHooks.ts` — `onPaymentSuccess` and `onPaymentRefunded` connect Stripe events to commission calculation/reversal

5. **Any migration files Dev 2 created** (014, 017, 018, 019, 020, 021) — these are applied in production. Create new migrations for schema changes.

6. **Route registration order** in `src/index.ts` — specific `/me/*` paths MUST be registered before the catch-all `/:id/*` routes. The current order is intentional.

---

## Test Coverage

As of this handoff: **39 suites, 653 tests passing**.

### Key Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/commission.service.test.ts` | 16 | Commission calculation, reversal, queries |
| `tests/unit/commission.accuracy.test.ts` | 10 | Precision: 15%/12%/18%/0% rates, rounding stress test, reversal accuracy |
| `tests/integration/orderSplitting.test.ts` | 8 | 2-supplier split, 3-supplier, single supplier, tax distribution, large order |
| `tests/integration/payout.test.ts` | 8 | Balance, history, create, summary, report |
| `tests/integration/supplierOrder.test.ts` | 17 | List, detail, stats, fulfillment state machine |
| `tests/integration/supplierAnalytics.test.ts` | 7 | Dashboard, top products, revenue trend, order status |
