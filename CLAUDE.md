# APlusMedDepot — Multi-Vendor Medical Supplies Marketplace

## Project Overview
Multi-vendor e-commerce platform: customers buy medical supplies from multiple suppliers in a single order. The system automatically splits orders by supplier, calculates commissions, and tracks payouts.

Three user roles: Customer, Supplier, Admin.

## Tech Stack
- **Runtime:** Node.js 20.x + TypeScript (strict mode)
- **Framework:** Express.js
- **Database:** PostgreSQL via Supabase (used as hosted Postgres, not full Supabase SDK)
- **Auth:** Supabase Auth (JWT-based)
- **Storage:** Supabase Storage (product images)
- **Payments:** Stripe API (PaymentIntents, webhooks)
- **Email:** Resend
- **Testing:** Jest + Supertest
- **Docs:** swagger-jsdoc + swagger-ui-express
- **Deployment:** AWS ECS/Fargate via GitHub Actions → ECR → ECS
- **Validation:** Zod for all request/response schemas
- **Security Middleware:** helmet, cors, express-rate-limit

## Project Structure
```
aplusmeddepot/
├── src/
│   ├── config/          # DB connection, env vars, Stripe/Resend init
│   ├── middleware/       # auth, rbac, errorHandler, rateLimiter
│   ├── routes/           # Express routers grouped by domain
│   │   ├── auth.ts
│   │   ├── products.ts
│   │   ├── cart.ts
│   │   ├── orders.ts
│   │   ├── payments.ts
│   │   ├── suppliers.ts
│   │   └── admin.ts
│   ├── controllers/      # Request handlers, thin — delegate to services
│   ├── services/         # Business logic lives here
│   ├── models/           # TypeScript interfaces + Zod schemas
│   ├── utils/            # Helpers, email templates, commission calc
│   └── index.ts          # App entry point
├── tests/
│   ├── unit/
│   └── integration/
├── migrations/           # SQL migration files
├── docs/                 # Created during sprints (see "When to Read Additional Docs")
├── .github/workflows/    # CI/CD pipeline
├── Dockerfile
├── docker-compose.yml
├── CLAUDE.md
├── AGENTS.md
└── package.json
```

## Code Conventions

### TypeScript
- Strict mode enabled, no `any` types — use `unknown` and narrow
- All API request/response bodies validated with Zod schemas
- Async/await everywhere, never raw callbacks
- Use named exports, not default exports

### Express Patterns
- Controllers are thin: parse request → call service → send response
- All business logic lives in `/services`
- Error handling through centralized error middleware, never try/catch in controllers — throw typed errors
- Use `express-async-errors` to catch async exceptions
- Always use `helmet()` for security headers in app setup
- Always use `cors()` with a restrictive origin config — never `*` in production
- Always use `express-rate-limit` on auth and payment endpoints

### Database
- Use Supabase client for queries, never raw `pg` connections
- All queries parameterized — never string interpolation in SQL
- Migrations are sequential numbered SQL files: `001_create_users.sql`, `002_create_suppliers.sql`
- For complex queries involving joins or aggregations, see `docs/DATABASE_SCHEMA.md` (created during Sprint 1)

### Testing & Commands
- Run all tests: `npm test`
- Run single test: `npm test -- --testPathPattern=<pattern>`
- Run lint: `npm run lint`
- Build (TypeScript compile): `npm run build`
- Dev server (hot reload): `npm run dev`
- Every API endpoint needs at least: 1 happy path test, 1 auth failure test, 1 validation failure test
- Use `supertest` for integration tests against actual Express app
- Mock external services (Stripe, Resend) in tests, never call real APIs

### Git
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`
- One logical change per commit
- Always run `npm test && npm run lint` before committing

## Critical Business Logic

### Order Splitting (HARDEST PART)
When a customer checks out with items from multiple suppliers, the system must:
1. Create 1 master order (customer sees this)
2. Group items by `supplier_id`
3. Create N sub-orders (one per supplier)
4. Calculate commission per line item using supplier's `commission_rate`
5. Record commission entries
6. Send 1 email to customer, N emails to suppliers
7. Wrap steps 1-6 in a single database transaction

For edge cases, partial fulfillment logic, and state machine details, see `docs/ORDER_SPLITTING.md` (created during Sprint 3).

### Commission Calculation
- `commission_amount = line_item_subtotal × supplier.commission_rate`
- `supplier_payout = line_item_subtotal - commission_amount`
- Default rate: 15%. High-volume: 12%. Premium category: 18%.
- Commission recorded per order_item, not per order

### Stripe Integration
- Use PaymentIntents flow (not Charges)
- Webhook signature verification is MANDATORY — use `stripe.webhooks.constructEvent()`
- Handle events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- All webhook handlers must be idempotent
- Never trust client-side payment confirmation, always verify server-side

### RLS (Row Level Security)
- Suppliers can ONLY see/edit their own products, orders, commissions
- Customers can ONLY see their own cart, orders
- Admins can access everything
- Test RLS by attempting cross-tenant access in integration tests

## Environment Variables
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
JWT_SECRET=
DATABASE_URL=
NODE_ENV=
PORT=
```
Never log or expose these. Use `dotenv` for local dev, AWS Secrets Manager for production.

## Common Mistakes to Avoid
- Never store cart in localStorage — cart is server-side, tied to user account
- Never calculate order totals client-side — always server-side with stock verification
- Never skip webhook signature verification — use `stripe.webhooks.constructEvent()`, not manual parsing
- Never return stack traces in API error responses — return typed error codes with messages
- Never use `SELECT *` — always specify columns explicitly
- Never hardcode CORS origin to `*` in production — specify allowed origins explicitly

## Sprint 2 (Week 2) — Supplier Product Management & Admin Workflow

### New API Endpoints

**Supplier Product CRUD** (`/api/suppliers/products`):
- `GET /` — list supplier's own products with filtering (status, search, category, pagination)
- `GET /stats` — aggregate stats (total, active, pending, rejected, out-of-stock, inventory value)
- `POST /` — create product (status defaults to `pending`)
- `PUT /:id` — update product (restricted fields for active products)
- `DELETE /:id` — soft delete
- `POST /:id/images` — upload image (max 5 per product, 5MB limit)
- `DELETE /:id/images/:imageIndex` — delete specific image
- `GET /:id/analytics` — per-product sales analytics with period filtering

**Supplier Inventory** (`/api/suppliers/inventory`):
- `GET /` — list inventory with low-stock summary
- `PUT /:productId` — update stock (uses `SELECT FOR UPDATE` locking)
- `POST /bulk-update` — bulk stock update (max 50 items, all-or-nothing)
- `GET /low-stock` — products at/below threshold

**Supplier Analytics** (`/api/suppliers/analytics`):
- `GET /products` — aggregate analytics: top 5 products by quantity, total revenue, order count, avg order value

**Admin Product Approval** (`/api/admin/products`):
- `GET /pending` — paginated pending products with supplier names
- `GET /:id/review` — full product detail + supplier info + review history
- `PUT /:id/approve` — approve → status = 'active', sends email
- `PUT /:id/request-changes` — request changes → status = 'needs_revision', sends email with feedback
- `PUT /:id/reject` — reject → status = 'rejected', sends email with reason

### Key Files

| Domain | Service | Controller | Routes |
|--------|---------|------------|--------|
| Supplier Products | `src/services/supplierProduct.service.ts` | `src/controllers/supplierProduct.controller.ts` | `src/routes/supplierProduct.routes.ts` |
| Product Images | `src/services/storage.service.ts` | (in supplierProduct controller) | (in supplierProduct routes) |
| Inventory | `src/services/supplierInventory.service.ts` | `src/controllers/supplierInventory.controller.ts` | `src/routes/supplierInventory.routes.ts` |
| Analytics | `src/services/supplierAnalytics.service.ts` | `src/controllers/supplierAnalytics.controller.ts` | `src/routes/supplierAnalytics.routes.ts` |
| Admin Approval | `src/services/adminProduct.service.ts` | `src/controllers/adminProduct.controller.ts` | `src/routes/adminProduct.routes.ts` |

### Database Changes (Migrations 014–019)
- **products table:** Updated status CHECK to `(pending, active, inactive, rejected, needs_revision)`. Added `low_stock_threshold`, `last_restocked_at`, `reviewed_by`, `reviewed_at`, `admin_feedback`.
- **stock_audit_log table:** Immutable audit trail for all stock changes.
- **lock_products_for_update():** SQL function for `SELECT ... FOR UPDATE` with deterministic lock ordering.
- **RLS hardening:** Fixed 4 gaps (014), removed redundant policy (017), added stock_audit_log policies (018).

### Patterns Established
- **Supplier-scoped queries:** All supplier services resolve `supplier_id` from `req.user.id` via `SupplierProductService.getSupplierIdFromUserId()`, then filter by `supplier_id`. Rejects unapproved suppliers.
- **Stock locking:** `lock_products_for_update` RPC for concurrent stock updates. Used by both inventory management and checkout.
- **Admin authorization:** Router-level `authenticate` + `authorize("admin")` middleware.
- **Email notifications:** `sendEmail()` with `baseLayout()` + `escapeHtml()` for HTML emails via Resend.

### Integration Points for Week 3
- **`splitOrderBySupplier`** in `src/services/orderSplitting.service.ts` — currently a stub. Must create sub-orders per supplier, calculate commissions using `supplier.commission_rate`, and use `lock_products_for_update` for stock decrement.
- **Commission calculation** will use `supplier.commission_rate` (percentage stored as NUMERIC(5,2), e.g., 15.00 = 15%).
- **Checkout flow** in `src/utils/inventory.ts` already uses `lock_products_for_update` for stock decrement.

### Open TODO Stubs (Future Sprints)
All placeholder TODO routes in `admin.ts`, `orders.ts`, `payments.ts`, `suppliers.ts`, `products.ts` are future work. The real implementations for orders and admin suppliers are in separate route files (`order.routes.ts`, `adminSuppliers.ts`, `adminProduct.routes.ts`).

## Sprint 3 (Week 3) — Order Splitting, Commissions, Payouts & Fulfillment

### New Services & Key Methods

| Service | Methods | Description |
|---------|---------|-------------|
| `src/services/commission.service.ts` | `calculateOrderCommissions`, `reverseOrderCommissions`, `getCommissionsByOrder`, `getCommissionsBySupplier`, `getCommissionSummary` | Per-item commission calculation, reversal, and querying |
| `src/services/orderSplitting.service.ts` | `splitOrderBySupplier`, `getSubOrders`, `getSupplierSubOrder` | Master order splitting into per-supplier sub-orders |
| `src/services/payout.service.ts` | `getSupplierBalance`, `getPayoutHistory`, `createPayoutRecord`, `generatePayoutReport`, `getEarningsBreakdown`, `getPayoutSummary` | Supplier payout tracking, reporting, and balance management |
| `src/services/supplierOrder.service.ts` | `getSupplierOrders`, `getSupplierOrderDetail`, `getSupplierOrderStats`, `updateItemFulfillment`, `checkAndUpdateMasterOrderStatus` | Supplier portal order views and fulfillment state machine |
| `src/services/hooks/paymentHooks.ts` | `onPaymentSuccess`, `onPaymentRefunded` | Connects Stripe payment events to commission calculation/reversal |

### New Routes

| Route File | Mount Path | Endpoints |
|------------|------------|-----------|
| `src/routes/commission.routes.ts` | `/api/commissions` (supplier), `/api/commissions/order/:orderId` and `/api/commissions/supplier/:supplierId` (admin) | Supplier commission list/summary, admin order/supplier commission views |
| `src/routes/payout.routes.ts` | `/api/suppliers/me/payouts` (supplier), `/api/admin/payouts` (admin) | Balance, history, summary, report (supplier); create payout (admin) |
| `src/routes/supplierOrder.routes.ts` | `/api/suppliers/me/orders` | List, detail, stats, item fulfillment update |
| `src/routes/supplierAnalytics.routes.ts` | `/api/suppliers/analytics` | Dashboard, top products, revenue trend, order status (4 new endpoints added to existing route file) |

### Commission Flow Integration

```
Stripe webhook → payment_intent.succeeded → onPaymentSuccess(orderId) → CommissionService.calculateOrderCommissions(orderId)
Stripe webhook → charge.refunded → onPaymentRefunded(orderId) → CommissionService.reverseOrderCommissions(orderId)
```

Commission hooks are in `src/services/hooks/paymentHooks.ts`. Failures are logged but do not block payment confirmation (fire-and-forget pattern).

### Database Changes (Migrations 020–021)
- **020:** Add `payment_method`, `paid_at`, `stripe_event_id` to payments; add `order_id` column to commissions; fix `payment_status` CHECK to use 'paid' instead of 'succeeded'
- **021:** Add 'reversed' to commissions status constraint; create `increment_supplier_balance` RPC function (atomic UPDATE with GREATEST(0) guard against negative balances)

### Key Patterns
- **Commission rate as percentage:** `commission_rate = 15.00` means 15%. Service divides by 100: `rate = ratePercent / 100`
- **Atomic balance updates:** All balance changes go through `increment_supplier_balance` RPC — never direct UPDATE
- **Fulfillment state machine:** `pending → processing → shipped → delivered` (no backward transitions)
- **Master order auto-status:** Derived from all items' fulfillment via `checkAndUpdateMasterOrderStatus()`
- **Route registration order:** In `src/index.ts`, specific `/me/*` paths are registered before catch-all `/:id/*` routes

### Handoff Documentation
For comprehensive Dev 2 documentation including architecture, edge cases, and what not to touch → read `docs/DEV2_HANDOFF.md`

## When to Read Additional Docs
NOTE: These docs are created as each feature is built during sprints. If a doc does not exist yet, it has not been built yet — proceed with the information in this file.

- For complex order splitting edge cases or if order tests fail → read `docs/ORDER_SPLITTING.md`
- For database schema questions, table relationships, or migration issues → read `docs/DATABASE_SCHEMA.md`
- For Stripe flow details or payment error handling → read `docs/STRIPE_INTEGRATION.md`
- For deployment, Docker, or AWS configuration → read `docs/DEPLOYMENT.md`
- For full project requirements and scope → read `docs/SOW.md`
- For RLS policy details per table → read `docs/RLS_POLICIES.md`
- For Dev 2 handoff (architecture, edge cases, limitations) → read `docs/DEV2_HANDOFF.md`
