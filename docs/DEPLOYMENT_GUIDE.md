# Deployment Guide

## 1. Prerequisites
- Node.js 20.x and npm
- Supabase account and project (Postgres + Auth + Storage)
- Stripe account (test mode for staging, live mode for production)
- PayPal developer account (sandbox for staging, live for production)
- Anthropic account (AI vendor verification)
- Resend account (transactional email)
- GitHub account (CI/CD workflows)
- AWS account (production deploy target: ECS/Fargate)

## 2. Environment Variables (Complete List)

Source of truth: `src/config/env.ts`.
Additional runtime/test variables are also listed below.

| Name | Required | Description | Example | Where to get |
|---|---|---|---|---|
| `NODE_ENV` | No (default) | Runtime mode (`development`, `test`, `production`) | `development` | Set manually per environment |
| `PORT` | No (default) | HTTP port for Express app | `3000` | Set manually |
| `SUPABASE_URL` | Yes | Supabase project URL | `https://xyzcompany.supabase.co` | Supabase Dashboard -> Project Settings -> API |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key | `eyJ...` | Supabase Dashboard -> Project Settings -> API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) | `eyJ...` | Supabase Dashboard -> Project Settings -> API |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret API key | `sk_test_...` / `sk_live_...` | Stripe Dashboard -> Developers -> API keys |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret | `whsec_...` | Stripe Dashboard/Stripe CLI webhook endpoint |
| `STRIPE_WEBHOOK_TOLERANCE` | No (default `300`) | Webhook signature tolerance (seconds) | `300` | Set manually |
| `PAYPAL_CLIENT_ID` | No (required to enable PayPal flows) | PayPal REST app client ID | `AZ...` | PayPal Developer Dashboard -> My Apps & Credentials |
| `PAYPAL_CLIENT_SECRET` | No (required to enable PayPal flows) | PayPal REST app secret | `EG...` | PayPal Developer Dashboard -> My Apps & Credentials |
| `PAYPAL_MODE` | No (default `sandbox`) | PayPal environment | `sandbox` / `live` | Set manually |
| `ANTHROPIC_API_KEY` | No (required to enable AI verification) | Anthropic API key for vendor risk analysis | `sk-ant-...` | Anthropic Console -> API Keys |
| `RESEND_API_KEY` | No (required to send email) | Resend API key for transactional email | `re_...` | Resend Dashboard -> API Keys |
| `FROM_EMAIL` | No (required to send email) | Sender identity for outbound email | `orders@aplusmeddepot.com` | Verified sender/domain in Resend |
| `JWT_SECRET` | Yes | JWT signing secret (>=32 chars) | `your_very_long_secret...` | Generate securely (Secrets Manager/1Password/etc.) |
| `DATABASE_URL` | Yes | Postgres connection string (Supabase DB) | `postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres` | Supabase Dashboard -> Project Settings -> Database |
| `FRONTEND_URL` | No (default `http://localhost:5173`) | Frontend base URL for email links and PayPal return/cancel URLs | `https://app.aplusmeddepot.com` | Frontend app URL |
| `CORS_ORIGIN` | Optional (recommended) | Allowed frontend origin for strict CORS (project standard; currently app uses default `cors()`) | `https://app.aplusmeddepot.com` | Set manually |
| `TAX_RATE` | Optional | Overrides default tax rate (`0.0825`) in cart/order/checkout services | `0.0825` | Set manually based on business rules |
| `RUN_RLS_TESTS` | Optional (test only) | Enables opt-in RLS integration test suite | `true` | Set manually for CI/local RLS runs |

## 3. Local Development Setup (Step-by-Step)
1. Install Node.js 20.x.
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Copy env template:
   ```bash
   cp .env.example .env
   ```
   On PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```
4. Fill `.env` with real keys (minimum required vars must be present).
5. Start local Postgres only if needed:
   ```bash
   docker compose up -d
   ```
6. Apply DB migrations (see section 4).
7. Start API:
   ```bash
   npm run dev
   ```
8. Verify health:
   - `GET http://localhost:3000/health`
   - Swagger: `http://localhost:3000/api-docs`

## 4. Database Setup (Migrations, Admin, Seed)

### 4.1 Apply migrations
Migrations are SQL files in `migrations/000_...sql` through `migrations/030_...sql`.

Option A (Supabase SQL Editor):
- Run each file in numeric order.
- Do not run out of order.

Option B (psql from terminal):
```powershell
Get-ChildItem .\migrations -File |
  Where-Object { $_.Name -match '^[0-9]{3}_.*\.sql$' } |
  Sort-Object Name |
  ForEach-Object {
    psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f $_.FullName
  }
```

### 4.2 Create first admin user
There is no dedicated seed script in `package.json`; bootstrap admin manually:
1. Create an auth user in Supabase Auth (Dashboard -> Authentication -> Users).
2. Copy the created user UUID.
3. Insert matching row into `public.users`:
   ```sql
   insert into public.users (
     id,
     email,
     password_hash,
     first_name,
     last_name,
     role,
     status,
     email_verified
   ) values (
     '<AUTH_USER_UUID>',
     'admin@yourdomain.com',
     'supabase_managed',
     'Platform',
     'Admin',
     'admin',
     'approved',
     true
   );
   ```

### 4.3 Seed data
No official seed command exists yet. For staging/dev, seed via SQL inserts (users/suppliers/products) after migrations.

## 5. Stripe Setup
1. In Stripe Dashboard, create/retrieve API keys.
2. Set:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
3. Install Stripe CLI and login:
   ```bash
   stripe login
   ```
4. Forward webhook events to local API:
   ```bash
   stripe listen --forward-to localhost:3000/api/payments/webhook
   ```
5. Copy the emitted `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.
6. Send test events:
   ```bash
   stripe trigger payment_intent.succeeded
   stripe trigger charge.refunded
   ```

## 6. PayPal Setup
1. Go to PayPal Developer Dashboard -> My Apps & Credentials.
2. Create app for `Sandbox` (staging) and another for `Live` (production).
3. Set:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_MODE=sandbox` for staging or `live` for production
4. Ensure `FRONTEND_URL` is set; PayPal return/cancel URLs are built from it.

## 7. Running Tests
- Build:
  ```bash
  npm run build
  ```
- Lint:
  ```bash
  npm run lint
  ```
- Test:
  ```bash
  npm test
  ```
- Optional RLS integration tests:
  ```bash
  RUN_RLS_TESTS=true npm test -- --testPathPattern=rls
  ```

## 8. Production Deployment (Docker + AWS ECS/Fargate)

### 8.1 Build and test Docker image
```bash
docker build -t aplusmeddepot-backend:latest .
docker run --rm -p 3000:3000 --env-file .env aplusmeddepot-backend:latest
```

### 8.2 Push image to ECR
1. Create ECR repository.
2. Authenticate Docker to ECR.
3. Tag and push image:
   ```bash
   docker tag aplusmeddepot-backend:latest <aws_account_id>.dkr.ecr.<region>.amazonaws.com/aplusmeddepot-backend:latest
   docker push <aws_account_id>.dkr.ecr.<region>.amazonaws.com/aplusmeddepot-backend:latest
   ```

### 8.3 ECS/Fargate service
1. Create ECS cluster.
2. Create task definition (Fargate):
   - Container port `3000`
   - Health check path `/health` (via ALB target group)
   - CPU/memory based on load
3. Add environment/config:
   - Non-secret config as env vars
   - Secrets in AWS Secrets Manager/SSM Parameter Store
4. Create ECS service attached to an ALB target group.
5. Use rolling deployment with minimum healthy tasks > 0.

### 8.4 GitHub CI/CD
Current workflow (`.github/workflows/ci.yml`) runs `build`, `lint`, and `test` on push/PR.
For full CD, add jobs to:
- build/push image to ECR
- update ECS task definition image
- deploy ECS service

## 9. Monitoring and Troubleshooting

### Monitoring
- ECS/Container logs -> CloudWatch Logs
- ALB health checks -> `/health`
- Stripe webhook delivery dashboard
- PayPal API response logs
- Supabase logs (DB/Auth)

### Common issues
- `Invalid environment variables` on startup:
  - Missing/invalid required env var (validated in `src/config/env.ts`).
- Stripe webhooks failing signature validation:
  - Wrong `STRIPE_WEBHOOK_SECRET`.
  - Ensure raw body middleware order remains unchanged for `/api/payments/webhook`.
- PayPal endpoints returning config errors:
  - Missing `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` or wrong `PAYPAL_MODE`.
- Email not sent:
  - Missing `RESEND_API_KEY` or invalid/unverified `FROM_EMAIL`.
- CORS issues in browser:
  - App currently uses default `cors()`. For production hardening, wire `CORS_ORIGIN` in `src/index.ts`.
