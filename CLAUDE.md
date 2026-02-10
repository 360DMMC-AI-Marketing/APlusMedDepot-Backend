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

## When to Read Additional Docs
NOTE: These docs are created as each feature is built during sprints. If a doc does not exist yet, it has not been built yet — proceed with the information in this file.

- For complex order splitting edge cases or if order tests fail → read `docs/ORDER_SPLITTING.md`
- For database schema questions, table relationships, or migration issues → read `docs/DATABASE_SCHEMA.md`
- For Stripe flow details or payment error handling → read `docs/STRIPE_INTEGRATION.md`
- For deployment, Docker, or AWS configuration → read `docs/DEPLOYMENT.md`
- For full project requirements and scope → read `docs/SOW.md`
