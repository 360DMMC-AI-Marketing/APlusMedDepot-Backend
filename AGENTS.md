# APlusMedDepot — Multi-Vendor Medical Supplies Marketplace

## Project Overview
Multi-vendor e-commerce platform: customers buy medical supplies from multiple suppliers in a single order. The system automatically splits orders by supplier, calculates commissions, and tracks payouts.

Three user roles: Customer, Supplier, Admin.

## Tech Stack
- Runtime: Node.js 20.x + TypeScript (strict mode)
- Framework: Express.js
- Database: PostgreSQL via Supabase (hosted Postgres)
- Auth: Supabase Auth (JWT-based)
- Storage: Supabase Storage (product images)
- Payments: Stripe API (PaymentIntents, webhooks)
- Email: Resend
- Testing: Jest + Supertest
- Docs: swagger-jsdoc + swagger-ui-express
- Deployment: AWS ECS/Fargate
- Validation: Zod
- Security Middleware: helmet, cors, express-rate-limit

## Commands
- Run tests: `npm test`
- Run single test: `npm test -- --testPathPattern=<pattern>`
- Run lint: `npm run lint`
- Build: `npm run build`
- Dev server: `npm run dev`

## Project Structure
- `src/config/` — DB, env vars, Stripe/Resend init
- `src/middleware/` — auth, rbac, rate-limit, error-handler
- `src/routes/` — Express routers by domain (auth, products, cart, orders, payments, suppliers, admin)
- `src/controllers/` — Thin request handlers, delegate to services
- `src/services/` — All business logic
- `src/models/` — TypeScript interfaces + Zod schemas
- `src/utils/` — Helpers, email templates, commission calc
- `tests/unit/` — Unit tests
- `tests/integration/` — Integration tests with supertest
- `migrations/` — Sequential SQL migration files
- `docs/` — Created during sprints (SOW, schema docs, architecture decisions)

## Code Conventions
- TypeScript strict mode, no `any` — use `unknown` and narrow
- Zod schemas for all request/response validation
- Async/await only, no callbacks
- Named exports, not default
- Controllers are thin: parse → service → respond
- Business logic in services only
- Centralized error middleware, throw typed errors
- Use `express-async-errors`
- Always use `helmet()` for security headers
- Always use `cors()` with restrictive origin config — never `*` in production
- Always use `express-rate-limit` on auth and payment endpoints
- Parameterized queries only, never string interpolation in SQL
- Conventional commits: feat:, fix:, test:, docs:, chore:
- Always run `npm test && npm run lint` before committing

## Critical Rules
- Stripe webhooks: ALWAYS verify signature with `stripe.webhooks.constructEvent()`
- All webhook handlers must be idempotent
- Order totals calculated server-side only, with stock verification
- Cart is server-side, tied to user account
- Never return stack traces in error responses
- Never use `SELECT *`, specify columns
- Never hardcode CORS origin to `*` in production
- RLS: suppliers see only their own data, customers see only their own data

## Additional Docs
NOTE: These docs are created as features are built. If a doc does not exist yet, proceed with info in this file.

- Order splitting edge cases: `docs/ORDER_SPLITTING.md`
- Database schema and relationships: `docs/DATABASE_SCHEMA.md`
- Stripe payment flow details: `docs/STRIPE_INTEGRATION.md`
- Deployment and AWS config: `docs/DEPLOYMENT.md`
- Full requirements: `docs/SOW.md`
