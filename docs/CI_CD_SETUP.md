# CI/CD Setup Guide

## Overview

APlusMedDepot uses GitHub Actions for CI/CD with the following flow:

```
PR → develop → CI (lint + build + test + security audit) → main → auto-deploy to AWS ECS
```

## GitHub Secrets

All secrets must be configured in **GitHub → Settings → Secrets and variables → Actions**.

### Required for CI (Tests)

| Secret | Description | Example |
|--------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) | `eyJ...` |
| `STRIPE_SECRET_KEY` | Stripe secret key (use test key) | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `PAYPAL_CLIENT_ID` | PayPal sandbox client ID | `AX...` |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox client secret | `EL...` |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI verification) | `sk-ant-...` |
| `RESEND_API_KEY` | Resend email API key | `re_...` |

### Required for Deployment (Production)

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key with ECR + ECS permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |

### Adding Secrets

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Enter the secret name and value
5. Click **Add secret**

For production secrets, use the **Environments** feature:
1. Go to **Settings → Environments → New environment**
2. Name it `production`
3. Add protection rules (required reviewers, wait timer)
4. Add environment-specific secrets

## CI Pipeline (`ci.yml`)

Triggered on pushes and PRs to `develop` and `main`.

### Jobs

| Job | Description | Dependencies |
|-----|-------------|--------------|
| **Lint** | Runs ESLint on all TypeScript files | None |
| **Build** | Compiles TypeScript to JavaScript | None |
| **Test** | Runs Jest test suite with coverage check (70% minimum) | Build |
| **Security** | Runs `npm audit` for high-severity vulnerabilities | None |

Lint and Build run in parallel. Test waits for Build to pass first.

## Deploy Pipeline (`deploy.yml`)

Triggered only on pushes to `main`.

### Steps

1. Checks out the code
2. Configures AWS credentials
3. Logs into Amazon ECR
4. Builds Docker image and tags with commit SHA + `latest`
5. Pushes both tags to ECR
6. Forces new ECS deployment

### AWS Infrastructure Required

- **ECR Repository:** `aplusmeddepot-backend`
- **ECS Cluster:** `aplusmeddepot-cluster`
- **ECS Service:** `aplusmeddepot-backend`
- **IAM User/Role** with permissions:
  - `ecr:GetAuthorizationToken`
  - `ecr:BatchCheckLayerAvailability`
  - `ecr:PutImage`
  - `ecr:InitiateLayerUpload`
  - `ecr:UploadLayerPart`
  - `ecr:CompleteLayerUpload`
  - `ecs:UpdateService`
  - `ecs:DescribeServices`

## Branch Protection Rules

Configure these in **Settings → Branches → Add rule**:

### `main` branch
- Require pull request reviews (1+ approvals)
- Require status checks to pass: `Lint`, `Build`, `Test`
- Require branches to be up to date before merging
- Do not allow force pushes
- Do not allow deletions

### `develop` branch
- Require status checks to pass: `Lint`, `Build`, `Test`
- Require branches to be up to date before merging

## Rollback Procedure

### Quick Rollback (ECS)

ECS keeps previous task definitions. To roll back:

```bash
# List recent task definitions
aws ecs list-task-definitions --family-prefix aplusmeddepot-backend --sort DESC --max-items 5

# Update service to use previous task definition
aws ecs update-service \
  --cluster aplusmeddepot-cluster \
  --service aplusmeddepot-backend \
  --task-definition aplusmeddepot-backend:<previous-revision-number>
```

### Rollback via Git

```bash
# Revert the problematic commit on main
git revert <commit-sha>
git push origin main
# This triggers a new deploy with the reverted code
```

### Rollback via ECR Image

```bash
# Deploy a specific previous image by commit SHA
aws ecs update-service \
  --cluster aplusmeddepot-cluster \
  --service aplusmeddepot-backend \
  --force-new-deployment

# Or update the task definition to point to a specific image tag
# then update the service
```

## Local Docker Testing

```bash
# Build the image
docker build -t aplusmeddepot-test .

# Run with environment variables
docker run -p 3000:3000 --env-file .env aplusmeddepot-test

# Verify
curl http://localhost:3000/health
```
