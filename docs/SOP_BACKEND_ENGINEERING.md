# APlusMedDepot Backend Engineering — Standard Operating Procedure

**Version:** 2.0
**Effective Date:** 2026-02-17
**Owner:** Sravya-Karra, Engineering Lead
**Classification:** Internal — Engineering Team
**Next Audit:** 2026-03-17 (30 days from effective date)
**Approval Status:** DRAFT — Requires engineering leadership sign-off

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Development Lifecycle Definition](#2-development-lifecycle-definition)
3. [AI-Assisted Development Policy](#3-ai-assisted-development-policy)
4. [CI/CD & Deployment Standards](#4-cicd--deployment-standards)
5. [Incident Response & Accountability](#5-incident-response--accountability)
6. [Governance & Enforcement](#6-governance--enforcement)
7. [Risk Assessment](#7-risk-assessment)
8. [Remediation Tracker](#8-remediation-tracker)
9. [Appendix: Checklists](#appendix-checklists)

---

## 1. Executive Summary

### How Backend Engineering Currently Operates

The APlusMedDepot backend is a Node.js 20 / TypeScript / Express.js API serving a multi-vendor medical supplies marketplace. The database is PostgreSQL hosted on Supabase. Payments are handled via Stripe PaymentIntents. Email is via Resend.

**Deployment Target Resolution:**
The SOW (page 2) specifies "Vercel Serverless / Railway." The CLAUDE.md and actual infrastructure artifacts (multi-stage `Dockerfile`, `docker-compose.yml`, `node dist/index.js` entrypoint) are built for **containerized deployment**. These are incompatible — Vercel Serverless requires function-shaped handlers, not a long-running Express process. **This SOP recognizes the codebase as container-first.** The deployment target is **containerized hosting** (AWS ECS/Fargate, Railway Docker, or equivalent). The SOW discrepancy must be resolved with the client before Week 5 deployment work begins. See [REM-001](#8-remediation-tracker).

The team consists of **3 contributors**:
- **Sravya-Karra** (18 commits) — Dev 1: Core backend, CI/CD, scaffolding
- **DevOps 360DMMC** (10 commits) — PR merges and integration, DevOps identity
- **Lohith** (7 commits) — Dev 2: Supplier features (tasks 1.3–1.8)

Development follows a feature-branch workflow merging into `develop`. The project has **35 total commits** across **10 feature branches**. There is no `main`-to-production release process yet.

### Where AI Agents Are Integrated

**Claude Opus 4.6 is co-author on 26 of 35 commits (74% of all commits).** AI is currently used for:
- Feature implementation (services, controllers, routes, validators)
- Test authoring (unit and integration tests)
- Migration SQL generation
- Database schema documentation
- Code review assistance within Claude Code sessions

AI-generated code is committed with the `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` trailer, providing partial traceability. This trailer is necessary but not sufficient — see Section 3 for the full AI governance controls.

### Current Risks (Prioritized)

| # | Risk | Severity | Enforcement Gap | Remediation ID |
|---|------|----------|----------------|----------------|
| 1 | No required PR reviewers | **CRITICAL** | Branch protection not configured; PRs self-merged | [REM-002](#8-remediation-tracker) |
| 2 | Deployment target unresolved | **CRITICAL** | SOW says Vercel; codebase is container-first | [REM-001](#8-remediation-tracker) |
| 3 | AI governance not auditable | **HIGH** | No review attestation, no prompt storage, no sign-off | [REM-003](#8-remediation-tracker) |
| 4 | No incident response infrastructure | **HIGH** | No on-call, no alerting, no SLOs, no DR plan | [REM-004](#8-remediation-tracker) |
| 5 | Security gates aspirational | **HIGH** | No tooling, no cadence, no owners | [REM-005](#8-remediation-tracker) |
| 6 | No code coverage thresholds | **HIGH** | Jest config has `collectCoverageFrom` but CI doesn't enforce | [REM-006](#8-remediation-tracker) |
| 7 | `cors()` with no origin restriction | **MEDIUM** | Defaults to `*`, violating CLAUDE.md | [REM-007](#8-remediation-tracker) |
| 8 | Order splitting is a stub | **MEDIUM** | `orderSplitting.service.ts` is a no-op | SOW deliverable |
| 9 | Single global rate limiter | **LOW** | CLAUDE.md requires per-endpoint on auth/payments | [REM-008](#8-remediation-tracker) |

---

## 2. Development Lifecycle Definition

### 2.1 Requirement Intake Process

1. Requirements originate from the product team (SOW).
2. Requirements are broken into **Sprints** with numbered **Tasks** (e.g., "Task 1.3", "Task 5").
3. Each task maps to a feature branch and produces a PR into `develop`.

**Current gap:** Task numbers appear in commit messages but are not linked to GitHub Issues. Commits reference "Task 7" but there is no Issue #7 to track it.

**Enforcement:** Starting immediately, all new tasks must be created as GitHub Issues before work begins. PR descriptions must reference the issue number. PRs without an issue reference will be flagged during review.
**Owner:** Sravya-Karra
**Verification:** Reviewer checks for issue link in PR description (part of PR Review Checklist, Section 9C).

### 2.2 Task Breakdown Methodology

Tasks are broken down by domain feature:
- Schema/migration changes
- Service layer implementation
- Controller + route wiring
- Validator schemas (Zod)
- Unit tests (service logic)
- Integration tests (HTTP layer via supertest)

**Decision Tree — Task Sizing:**

```
Is the task a single endpoint with < 3 files changed?
  YES → Single commit, single PR
  NO  → Does it span multiple domains (auth + orders + payments)?
    YES → Break into sub-tasks, one PR per sub-task
    NO  → One PR, multiple commits (one per logical unit)
```

### 2.3 Branching Strategy

```
main (production release gate — requires engineering lead approval)
  └── develop (integration branch, default target for all PRs)
        └── feature/<domain-description>
        └── fix/<issue-number>-<description>
        └── chore/<description>
```

**Rules:**
- All feature branches are created from `develop`.
- All PRs target `develop`.
- `main` is reserved for production releases.
- Branch naming must include issue number when applicable: `feature/42-order-splitting`.
- Merged branches are auto-deleted (see [REM-002](#8-remediation-tracker)).

### 2.4 Pull Request Workflow

| Step | Action | Owner | Enforcement |
|------|--------|-------|-------------|
| 1 | Create feature branch from latest `develop` | Developer | Convention |
| 2 | Implement with conventional commits | Developer + AI | Pre-commit hook (lint-staged) |
| 3 | Push to remote; CI runs automatically | Automated | GitHub Actions (`ci.yml`) |
| 4 | Open PR with description, test plan, issue reference | Developer | PR template (enforced by reviewer) |
| 5 | CI must pass (build + lint + test + coverage + audit) | Automated | Required status check in branch protection |
| 6 | At least 1 human reviewer approves | Reviewer | Branch protection rule (required reviews = 1) |
| 7 | If AI-generated high-risk code: AI review attestation comment posted | Reviewer | See Section 3.2 |
| 8 | Squash-merge into `develop` | Developer | Branch protection (require linear history) |
| 9 | Feature branch auto-deleted | Automated | GitHub repo setting |

### 2.5 Review Requirements

**Enforced via branch protection (see [REM-002](#8-remediation-tracker)):**
- 1 approving review required (not the PR author)
- All status checks must pass
- Stale reviews dismissed on new pushes
- Force push disabled on `develop` and `main`
- Squash merge required (linear history)

### 2.6 Testing Requirements

**Unit Tests (tests/unit/):**
- Test service logic in isolation
- Mock all external dependencies (Supabase, Stripe, Resend)
- Mock all service modules that trigger the env validation chain
- Minimum: 1 happy path + 1 error path per public method

**Integration Tests (tests/integration/):**
- Test HTTP endpoints via supertest against the Express app
- Mock external services, never call real APIs
- Minimum per endpoint: 1 happy path, 1 auth failure, 1 validation failure
- RLS cross-tenant access tests for every data-access endpoint

**Coverage (enforced in CI — see [REM-006](#8-remediation-tracker)):**

| Metric | Threshold | Enforcement |
|--------|-----------|-------------|
| Line coverage | >= 80% | CI fails build if below |
| Function coverage | >= 80% | CI fails build if below |
| Branch coverage | >= 70% | CI fails build if below |
| Statement coverage | >= 80% | CI fails build if below |

**Verification:** CI runs `npm test -- --coverage` and Jest's `coverageThreshold` config blocks the build if thresholds are not met. This is a required status check for merge.

### 2.7 Security Validation

**Currently enforced (automated):**
- [x] Helmet.js security headers (`src/index.ts:24`)
- [x] Zod validation on all request bodies
- [x] JWT-based authentication via Supabase Auth
- [x] RBAC middleware (`src/middleware/rbac.ts`)
- [x] RLS policies on all database tables
- [x] Parameterized queries via Supabase client
- [x] Error handler strips stack traces (`src/middleware/errorHandler.ts:59-64`)
- [x] Environment variables validated via Zod schema (`src/config/env.ts`)
- [x] Pre-commit lint hook (Husky + lint-staged)

**Not yet enforced (see [REM-005](#8-remediation-tracker) for deadlines):**
- [ ] CORS restricted to explicit origins
- [ ] `npm audit` in CI
- [ ] Per-route rate limiters on auth/payment endpoints
- [ ] Stripe webhook signature verification
- [ ] Secret scanning in CI
- [ ] Forbidden pattern scanning (`SELECT *`, `eval(`, raw SQL interpolation)

### 2.8 Documentation Requirements

| Artifact | When | Owner | Enforcement |
|----------|------|-------|-------------|
| `docs/DATABASE_SCHEMA.md` | Every migration | Developer who writes migration | PR reviewer checks |
| `CLAUDE.md` | Convention changes | Engineering Lead | — |
| `AGENTS.md` | AI tooling changes | Engineering Lead | — |
| Swagger annotations | Every new route | Developer | PR reviewer checks |
| PR description | Every PR | Developer | PR template + reviewer |
| AI review attestation | Every PR with high-risk AI code | Reviewer | Section 3.2 |

---

## 3. AI-Assisted Development Policy

### 3.1 Risk Classification for AI-Generated Code

Every file touched by AI is classified into one of three risk tiers. The tier determines the review controls required.

| Tier | Scope | Examples | Required Controls |
|------|-------|---------|-------------------|
| **Tier 1 — Critical** | Security boundaries, financial logic, data schemas | SQL migrations, RLS policies, auth middleware, Stripe integration, commission calculations, order splitting | Prompt stored in `docs/ai-prompts/`, line-by-line review, attestation comment, engineering lead sign-off |
| **Tier 2 — Standard** | Business logic, data access, API endpoints | Service methods, controllers, route handlers, validators | PR-level review, attestation comment, 1 reviewer approval |
| **Tier 3 — Low Risk** | Tests, documentation, formatting, types | Test files, type definitions, README updates, Swagger annotations | PR-level review, 1 reviewer approval |

### 3.2 Review Attestation Requirement

For every PR containing AI-generated code at **Tier 1 or Tier 2**, the reviewer must post an attestation comment on the PR before approving:

```
## AI Review Attestation

- **Risk tier:** [Tier 1 / Tier 2]
- **Files reviewed:** [list of AI-touched files]
- **I confirm:**
  - [ ] I have read and understand every line of AI-generated code in this PR
  - [ ] Business logic matches the SOW/requirements (not AI interpretation)
  - [ ] No hallucinated table names, column names, or API contracts
  - [ ] Financial calculations verified with manual examples (if applicable)
  - [ ] SQL migrations manually verified for correctness (if applicable)
  - [ ] Security implications reviewed (auth, RLS, input validation)

**Reviewer:** @<github-username>
**Date:** YYYY-MM-DD
```

**Enforcement:** PRs with Tier 1 files that lack this attestation comment must not be merged. The reviewer is responsible for posting it. The engineering lead spot-checks attestation compliance weekly.

**Verification:** Engineering lead runs a monthly audit: pull all merged PRs, check for attestation comments on any PR with `Co-Authored-By: Claude` in commits. Non-compliant PRs are logged and discussed in the next team sync.

### 3.3 When AI Agents May Generate Code

AI (Claude Code) is authorized for all three tiers, subject to the review controls in 3.1.

### 3.4 What AI Is Forbidden From Doing

- Push to remote repositories autonomously
- Run destructive git commands (`push --force`, `reset --hard`, `branch -D`) without explicit developer approval
- Modify CI/CD pipeline files (`ci.yml`, `Dockerfile`, GitHub Actions) without human review
- Create or modify `.env` files or commit secrets
- Make direct database changes to non-local environments
- Approve its own pull requests
- Disable security checks, linters, or test suites
- Generate Stripe API calls with live keys
- Modify GitHub branch protection or repository settings

**Enforcement:** These prohibitions are configured in `CLAUDE.md` and `AGENTS.md` which Claude Code reads at session start. Violations are detected during PR review (reviewer checks diff for CI/CD, .env, or protection rule changes).

### 3.5 Traceability Requirements

| Requirement | Mechanism | Enforcement |
|-------------|-----------|-------------|
| AI involvement in commits | `Co-Authored-By` trailer | Claude Code adds automatically; reviewer verifies in diff |
| Prompt storage for Tier 1 changes | `docs/ai-prompts/<feature>.md` | Reviewer checks that prompt file exists before approving Tier 1 PRs |
| Risk tier classification | Attestation comment on PR | Reviewer posts; engineering lead audits monthly |
| AI contribution tracking | `git log --all --format="%b" \| grep "Co-Authored-By: Claude" \| wc -l` | Engineering lead reports per sprint |

**Prompt storage format** (`docs/ai-prompts/<feature>.md`):
```markdown
# Feature: [Name]
**Date:** YYYY-MM-DD
**Developer:** [Name]
**Tier:** 1

## Prompt
[The prompt or task description given to Claude Code]

## Key Decisions Made
[What the AI decided and why the developer accepted it]

## Files Generated
[List of files AI created or significantly modified]
```

### 3.6 AI Defect Accountability

1. **The human who merged the PR owns the defect.** AI is a tool, not a responsible party.
2. Identify the defective commit via `git log` (check for `Co-Authored-By: Claude` trailer).
3. If AI-generated Tier 1 code: retrieve the stored prompt from `docs/ai-prompts/`. Include in post-mortem.
4. If AI-generated and the attestation comment was posted: the reviewer who attested shares accountability.
5. If AI-generated and no attestation was posted: the merger violated this SOP. Escalate to engineering lead.
6. Fix follows normal flow: create issue, branch, fix, PR, review, merge.

### 3.7 AI Dependency Risk Control

74% AI co-authorship creates a bus-factor risk. Controls:

| Control | Frequency | Owner | Enforcement |
|---------|-----------|-------|-------------|
| Developer can explain any code in their PR during review | Every PR review | Reviewer | Reviewer asks clarifying questions; if developer cannot explain, PR is not approved |
| Architectural decisions documented in `docs/` | Per feature | Developer | PR checklist item |
| Knowledge transfer for AI-generated code in new domains | Per sprint | Engineering lead | Sprint retro agenda item |

---

## 4. CI/CD & Deployment Standards

### 4.1 Deployment Target — Resolved

**Decision:** The deployment target is **containerized hosting**.

| Evidence | Value |
|----------|-------|
| `Dockerfile` | Multi-stage Alpine build, `node dist/index.js` entrypoint |
| `docker-compose.yml` | PostgreSQL service for local dev |
| `package.json` `start` script | `node dist/index.js` (long-running process) |
| SOW (page 2) | "Vercel Serverless / Railway" |
| CLAUDE.md | "AWS ECS/Fargate via GitHub Actions → ECR → ECS" |

**Resolution:** The codebase is a long-running Express server. It cannot run on Vercel Serverless without significant refactoring. The SOW's deployment target is outdated or incorrect. CLAUDE.md's ECS/Fargate target matches the actual architecture.

**Action required:** Confirm with client whether deployment is AWS ECS/Fargate or Railway Docker. Both are compatible with the current Dockerfile. Update SOW to match. See [REM-001](#8-remediation-tracker).

**Until resolved:** All rollback, deployment, and infrastructure sections in this SOP assume containerized deployment (Docker). Procedures are written container-agnostic (not ECS-specific) so they apply to Railway Docker or ECS equally.

### 4.2 Current CI Pipeline

**File:** `.github/workflows/ci.yml`

```
Trigger: push/PR to develop or main
Steps:
  1. Checkout code
  2. Setup Node 20 with npm cache
  3. npm ci
  4. npm run build
  5. npm run lint
  6. npm test (NODE_ENV=test)
```

### 4.3 Required CI Pipeline

The following changes to `ci.yml` are required. See [REM-006](#8-remediation-tracker) for implementation deadline.

```yaml
name: CI
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm test -- --coverage
        env:
          NODE_ENV: test
      - run: npm audit --audit-level=high

  # Scans for forbidden patterns in source code
  code-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check for SELECT *
        run: "! grep -rn 'SELECT \\*' src/ --include='*.ts' || (echo 'FAIL: SELECT * found' && exit 1)"
      - name: Check for eval/Function
        run: "! grep -rn 'eval(' src/ --include='*.ts' || (echo 'FAIL: eval() found' && exit 1)"
      - name: Check for raw SQL interpolation in migrations
        run: "! grep -rn '${' migrations/ --include='*.sql' || (echo 'FAIL: string interpolation in SQL' && exit 1)"

  docker:
    needs: validate
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t aplusmed-backend .
      - run: docker run --rm aplusmed-backend node -e "console.log('smoke-test-ok')"
```

### 4.4 Build Validation — Merge Gates

All items in this table are **required status checks** configured in GitHub branch protection. A PR cannot be merged if any fail.

| Check | Enforcement | Currently Active? | Remediation |
|-------|------------|-------------------|-------------|
| TypeScript compilation | `npm run build` in CI | YES | — |
| ESLint | `npm run lint` in CI | YES | — |
| Jest test suite | `npm test` in CI | YES | — |
| Coverage >= 80% lines | `coverageThreshold` in jest.config.ts + `--coverage` flag | **NO** | [REM-006](#8-remediation-tracker) |
| No high/critical npm vulns | `npm audit --audit-level=high` in CI | **NO** | [REM-006](#8-remediation-tracker) |
| No forbidden patterns | `code-scan` job in CI | **NO** | [REM-006](#8-remediation-tracker) |
| 1 human reviewer approval | Branch protection rule | **NO** | [REM-002](#8-remediation-tracker) |

### 4.5 Linting / Formatting

**ESLint** (flat config, `eslint.config.mjs`):
- TypeScript-eslint recommended rules
- `no-explicit-any`: currently `warn`, must be changed to `error` ([REM-006](#8-remediation-tracker))
- `no-unused-vars` with `argsIgnorePattern: "^_"`
- Prettier integration via `eslint-config-prettier`

**Prettier** (`.prettierrc`): semicolons, trailing commas, double quotes, 100 width, 2-space indent.

**Pre-commit Hook** (Husky + lint-staged): runs `eslint --fix` and `prettier --write` on staged `.ts` files. This is already enforced.

### 4.6 Rollback Protocol

**Prerequisite:** Deployment target confirmed (see 4.1).

**Application rollback (container-based):**

```
1. Detect failure: health check failing, error rate > 5%, or alert fires
2. Do NOT attempt to "fix forward" under pressure
3. Roll back the container to the previous image tag/revision:
   - ECS: aws ecs update-service --force-new-deployment --task-definition <previous-revision>
   - Railway: railway rollback
   - Generic Docker: docker-compose up -d --force-recreate with previous image tag
4. Verify /health returns 200
5. Notify team in Slack/comms channel
6. Investigate root cause on a new branch from develop
7. Fix → test → deploy through normal CI/CD pipeline
```

**Database rollback:**
Migrations are forward-only SQL. Rollback strategy:

| Scenario | Action |
|----------|--------|
| Column added | Write a new migration to drop the column |
| Table added | Write a new migration to drop the table |
| Column type changed | Write a new migration to revert the type |
| Data corrupted | Restore from Supabase point-in-time recovery (see Section 5.5) |

Current migrations (000–016) have no DOWN scripts. This is acceptable for the current phase (pre-production). Before the first production deployment, every migration that alters existing columns must have a documented revert migration. See [REM-001](#8-remediation-tracker).

### 4.7 Production Release Checklist

Applies when `develop` is promoted to `main` for production deployment.

**Gate 1 — Automated (CI must pass):**
- [ ] TypeScript build succeeds
- [ ] ESLint passes
- [ ] All tests pass with coverage >= 80%
- [ ] `npm audit` — no high/critical vulnerabilities
- [ ] Forbidden pattern scan passes
- [ ] Docker image builds successfully

**Gate 2 — Human verification (engineering lead signs off):**
- [ ] All stub services removed or gated (`orderSplitting.service.ts` must be implemented or behind a feature flag that returns 501)
- [ ] CORS configured with production origin (not `*`)
- [ ] Rate limiters configured per-route for auth and payment endpoints
- [ ] Stripe webhook signature verification implemented and covered by tests
- [ ] Environment variables set in hosting provider's secrets management
- [ ] Health check endpoint (`/health`) responding
- [ ] Rollback procedure tested on staging
- [ ] On-call engineer assigned for first 72 hours

**Gate 3 — Sign-off:**
- [ ] Engineering lead posts approval in the `main` PR
- [ ] No unresolved Tier 1 attestation gaps in the release's commit range

---

## 5. Incident Response & Accountability

### 5.1 Severity Taxonomy

| Severity | Definition | Response Time | Resolution Target | Post-Mortem Required? |
|----------|-----------|--------------|-------------------|----------------------|
| **P1 — Critical** | Platform down, payments failing, data loss, security breach | 15 minutes | 1 hour | YES — within 48 hours |
| **P2 — Major** | Core feature broken (orders, cart, auth), partial outage, data integrity issue | 30 minutes | 4 hours | YES — within 5 business days |
| **P3 — Minor** | Non-critical feature broken, degraded performance, UI errors from bad API response | Next business day | 3 business days | Only if recurring |
| **P4 — Low** | Cosmetic, documentation, minor logging issues | Next sprint | Next sprint | No |

### 5.2 Service Level Objectives (SLOs)

These SLOs apply once the system is in production. They are targets, not contractual SLAs.

| SLI (Indicator) | Measurement | SLO (Objective) |
|-----------------|-------------|-----------------|
| **Availability** | `(successful responses / total requests) * 100` where successful = non-5xx | 99.5% over 30-day rolling window |
| **Latency (p95)** | 95th percentile response time for API requests | < 500ms |
| **Latency (p99)** | 99th percentile response time for API requests | < 2000ms |
| **Error rate** | `5xx responses / total responses` | < 0.5% |
| **Payment success rate** | `successful payment intents / total payment intents` | > 99% |

**Measurement:** Requires observability infrastructure (see 5.6). Until instrumented, SLOs are aspirational. Instrumentation is tracked in [REM-004](#8-remediation-tracker).

### 5.3 On-Call Rotation

**Pre-production (current phase):** No on-call required. Issues are handled during business hours.

**Post-production launch:**

| Role | Responsibility | Current Assignment |
|------|---------------|--------------------|
| Primary on-call | Responds to P1/P2 alerts within SLO response times | Sravya-Karra (Week A) / Lohith (Week B) |
| Escalation | Contacted if primary cannot resolve within resolution target | Engineering lead |
| Backup | Contacted if primary is unreachable for 30 minutes | DevOps 360DMMC |

On-call rotation is weekly, Monday 9am to Monday 9am. Handoff includes a 15-minute sync at rotation boundary.

### 5.4 Component Ownership (RACI)

| Component | Responsible | Accountable | Consulted | Informed |
|-----------|------------|-------------|-----------|----------|
| Auth (login, register, JWT, RBAC) | Sravya-Karra | Sravya-Karra | — | DevOps |
| Product catalog (CRUD, search, images) | Sravya-Karra | Sravya-Karra | — | DevOps |
| Supplier management (registration, docs, approval) | Lohith | Sravya-Karra | — | DevOps |
| Cart & Checkout | Sravya-Karra | Sravya-Karra | — | DevOps |
| Orders (creation, status, history) | Sravya-Karra | Sravya-Karra | — | DevOps |
| Order splitting & commissions | **TBD — must assign before Sprint 3 work** | Sravya-Karra | — | DevOps |
| Payments (Stripe) | **TBD — must assign before Sprint 3 work** | Sravya-Karra | — | DevOps |
| CI/CD & DevOps | DevOps 360DMMC | Sravya-Karra | — | — |
| Database schema & migrations | Developer who writes the migration | Sravya-Karra | — | DevOps |
| RLS policies | Developer who writes the policy | Sravya-Karra | — | DevOps |

**Accountable** = the person who answers for the outcome regardless of who did the work. Sravya-Karra is accountable for all backend components as engineering lead.

### 5.5 Disaster Recovery & Backup

| Concern | Current State | Required State | Remediation |
|---------|--------------|----------------|-------------|
| Database backups | Supabase provides automatic daily backups (Pro plan) and point-in-time recovery up to 7 days | Verify backup configuration in Supabase dashboard. Document the recovery procedure. | [REM-004](#8-remediation-tracker) |
| RPO (Recovery Point Objective) | Unknown | 1 hour (Supabase PITR on Pro plan provides this) | Verify Supabase plan level |
| RTO (Recovery Time Objective) | Unknown | 4 hours (restore from backup + redeploy) | Document and drill |
| Code recovery | Git repo on GitHub (distributed copies) | Acceptable — GitHub provides redundancy | — |
| Secrets recovery | Stored in `.env` locally, not documented for production | Production: hosting provider's secrets manager. Document all required env vars and their sources. | [REM-004](#8-remediation-tracker) |

**Disaster recovery drill:** Before production launch, perform one DR drill: restore the database from a Supabase backup to a test project, deploy the container pointing at it, and verify the `/health` endpoint and one API flow work. Document the result.

### 5.6 Logging & Observability

**Current state:**
- `console.error(err)` in error handler
- `console.log` for order split stub
- `console.warn` for invalid state transitions
- No structured logging, no metrics, no tracing, no alerting

**Required before production ([REM-004](#8-remediation-tracker)):**

| Layer | Tool | Purpose |
|-------|------|---------|
| Structured logging | pino (recommended) or winston | JSON logs with timestamp, level, correlationId, message |
| Request correlation | `x-request-id` middleware | Tie all log entries for a single request together |
| Error alerting | Hosting provider's alerting (e.g., CloudWatch Alarms, Railway metrics) or Sentry | Notify on-call when error rate exceeds SLO |
| Uptime monitoring | External health check (e.g., UptimeRobot, Better Uptime) | Ping `/health` every 60 seconds, alert on failure |
| Log retention | Hosting provider or log drain | Minimum 30 days for operational logs, 90 days for security-relevant logs |

**PII policy:** Logs must never contain email addresses, full names, password hashes, payment card details, or Stripe secrets. User IDs (UUIDs) are acceptable.

### 5.7 Post-Mortem Process

**Required for:** All P1 and P2 incidents. P3 incidents if recurring (3+ occurrences in 30 days).

**Template:**
```
## Incident: [Title]
**Date:** YYYY-MM-DD
**Duration:** X minutes
**Severity:** P1/P2/P3
**On-call:** [Name]
**Accountable owner:** [Name from RACI]

### Timeline
[Minute-by-minute factual sequence: detection → response → resolution]

### Root cause
[Technical root cause — be specific]

### Was AI-generated code involved?
[Yes/No]
[If yes: which commit, which prompt (link to docs/ai-prompts/ if Tier 1), was attestation completed?]

### Impact
[Users affected, orders impacted, revenue lost, data affected]

### Resolution
[What fixed it — include commit hash]

### Action items
| # | Action | Owner | Deadline | Status |
|---|--------|-------|----------|--------|
| 1 | [Specific action] | [Name] | YYYY-MM-DD | Open |
```

**Process:** Post-mortem is written by the on-call engineer, reviewed by the accountable owner, and stored in `docs/post-mortems/YYYY-MM-DD-<title>.md`. Action items are tracked as GitHub Issues.

---

## 6. Governance & Enforcement

### 6.1 Merge Gates (Automated)

These are **configured as required status checks** in GitHub branch protection. A PR cannot be merged if any fail. No exceptions.

| Gate | Enforcement Mechanism | Currently Active? | Remediation |
|------|-----------------------|-------------------|-------------|
| TypeScript build | CI job: `npm run build` | YES | — |
| ESLint | CI job: `npm run lint` | YES | — |
| All tests pass | CI job: `npm test` | YES | — |
| Coverage >= 80% lines | CI job: `npm test -- --coverage` + jest.config.ts `coverageThreshold` | **NO** | [REM-006](#8-remediation-tracker) |
| No high/critical npm vulns | CI job: `npm audit --audit-level=high` | **NO** | [REM-006](#8-remediation-tracker) |
| No forbidden patterns | CI job: `code-scan` | **NO** | [REM-006](#8-remediation-tracker) |
| 1 human reviewer | Branch protection: required reviews = 1 | **NO** | [REM-002](#8-remediation-tracker) |

### 6.2 Merge Gates (Human — Reviewer Responsibility)

These cannot be automated and rely on reviewer discipline. Compliance is audited monthly by the engineering lead.

| Gate | Verification Method | Audit Mechanism |
|------|-------------------|-----------------|
| PR has description with summary and test plan | Reviewer reads the PR description | Monthly spot-check of merged PRs |
| AI attestation comment posted for Tier 1/2 PRs | Reviewer posts attestation | Monthly audit: check PRs with `Co-Authored-By: Claude` for attestation |
| Issue number referenced | Reviewer checks PR description | Monthly spot-check |

### 6.3 Deployment Gates

Applies when deploying to production (merging `develop` → `main` and releasing):

| Gate | Mechanism | Owner |
|------|-----------|-------|
| All automated merge gates pass | CI on the `main` PR | Automated |
| No stub services in production code | Engineering lead reviews diff | Engineering lead |
| Staging smoke test passed | Manual test against staging environment | Developer |
| Production release checklist completed (Section 4.7) | Checklist posted as comment on `main` PR | Engineering lead |
| Engineering lead explicit approval | Approving review on the `main` PR | Engineering lead |

### 6.4 Required Approvals Matrix

| Action | Required Approvals | Enforcement |
|--------|--------------------|-------------|
| Merge to `develop` | 1 human reviewer (not PR author) | Branch protection |
| Merge to `main` | Engineering lead approval | Branch protection (add engineering lead as required reviewer for `main`) |
| SQL migration to production DB | Engineering lead sign-off in PR comment | Reviewer checks for sign-off |
| New npm dependency | Reviewer verifies license, size, maintenance | PR review checklist item |
| CI/CD pipeline changes | Engineering lead approval | Branch protection (CODEOWNERS on `.github/`) |
| RLS policy changes | Engineering lead approval | PR reviewer checks; file path flagged via CODEOWNERS |
| Stripe integration changes | Engineering lead approval | PR reviewer checks; file path flagged via CODEOWNERS |

**CODEOWNERS enforcement:** Create `.github/CODEOWNERS` file:
```
# Require engineering lead review for sensitive paths
.github/ @sravya-karra
migrations/ @sravya-karra
src/middleware/auth.ts @sravya-karra
src/middleware/rbac.ts @sravya-karra
src/config/ @sravya-karra
```

### 6.5 Security Gates — With Required Tooling and Deadlines

Every item below has a specific tool, owner, and deadline. All are tracked in Section 8.

| Security Control | Tool | Cadence | Owner | Deadline | Remediation |
|-----------------|------|---------|-------|----------|-------------|
| Dependency vulnerability scanning | `npm audit --audit-level=high` in CI | Every PR | Automated (CI) | [REM-006](#8-remediation-tracker) deadline | [REM-006](#8-remediation-tracker) |
| Dependency update alerts | GitHub Dependabot | Continuous | DevOps 360DMMC | [REM-005](#8-remediation-tracker) deadline | [REM-005](#8-remediation-tracker) |
| Forbidden code pattern scan | CI `code-scan` job (grep for `SELECT *`, `eval(`, `${` in SQL) | Every PR | Automated (CI) | [REM-006](#8-remediation-tracker) deadline | [REM-006](#8-remediation-tracker) |
| Secret scanning | GitHub secret scanning (free for public repos) or `gitleaks` in CI | Every push | Automated | [REM-005](#8-remediation-tracker) deadline | [REM-005](#8-remediation-tracker) |
| CORS restriction | Environment-specific origin config in `src/index.ts` | One-time fix + review | Sravya-Karra | Before production deploy | [REM-007](#8-remediation-tracker) |
| Per-route rate limiting | Additional rate limiter middleware on `/api/auth` and `/api/payments` | One-time fix | Sravya-Karra | Before production deploy | [REM-008](#8-remediation-tracker) |
| Stripe webhook verification | `stripe.webhooks.constructEvent()` in webhook handler | One-time implementation | Assigned Sprint 3 owner | Sprint 3 | SOW deliverable |
| RLS cross-tenant test coverage | Integration tests that attempt cross-tenant access | Every PR touching data access | Developer | Ongoing | PR review checklist |

---

## 7. Risk Assessment

### 7.1 AI Hallucination Risk

**Severity: HIGH | Probability: MEDIUM**

AI may generate code that implements business logic incorrectly, creates plausible but wrong SQL migrations, generates tests that pass without testing meaningful behavior, or invents API response shapes that don't match the frontend contract.

**Evidence from codebase:** `generateOrderNumber()` uses `Math.random()` — not cryptographically secure and will collide at scale (~1M possible values).

**Controls:**

| Control | Enforcement | Owner |
|---------|-------------|-------|
| Human review of all business logic | Tier 1/2 attestation | Reviewer |
| Financial calculations verified with manual examples | Attestation checklist item | Reviewer |
| Integration tests verify DB state, not just response shapes | PR review checklist | Reviewer |
| Prompt stored for Tier 1 code | `docs/ai-prompts/` | Developer |

### 7.2 Security Injection Risk

**Severity: HIGH | Probability: LOW (currently mitigated)**

Supabase client parameterizes queries. Zod validates inputs. Error handler strips internals.

**Controls:**

| Control | Enforcement | Status |
|---------|-------------|--------|
| No raw `pg` connections | Code review + grep in CI for `pg.Pool`, `pg.Client` | Grep to be added in [REM-006](#8-remediation-tracker) |
| No `eval()` or `Function()` | CI `code-scan` job | To be added in [REM-006](#8-remediation-tracker) |
| No `SELECT *` | CI `code-scan` job | To be added in [REM-006](#8-remediation-tracker) |
| No SQL string interpolation | CI `code-scan` job for `${` in `.sql` files | To be added in [REM-006](#8-remediation-tracker) |
| RLS changes require engineering lead review | CODEOWNERS on `migrations/` | To be added in [REM-002](#8-remediation-tracker) |

### 7.3 Over-Reliance on AI Agents

**Severity: HIGH | Probability: HIGH (74% AI co-authored commits)**

**Controls:**

| Control | Enforcement | Owner | Frequency |
|---------|-------------|-------|-----------|
| Developer must explain PR code during review | Reviewer asks questions; blocks if developer can't explain | Reviewer | Every PR |
| Architectural decisions in `docs/` | PR checklist item | Developer | Per feature |
| AI contribution % tracked | Engineering lead runs git query | Engineering lead | Per sprint |
| If AI contribution > 85% for a sprint, team discussion required | Engineering lead flags | Engineering lead | Per sprint |

### 7.4 Scalability Risks

| Risk | Severity | Owner | Remediation | Deadline |
|------|----------|-------|-------------|----------|
| Order number collisions (`Math.random()`) | MEDIUM | Sprint 3 owner | Replace with DB sequence or UUID | Before production |
| Global rate limiter throttles legitimate users | LOW | Sravya-Karra | Per-route rate limiters | [REM-008](#8-remediation-tracker) |
| Stock decrement race conditions | MEDIUM | Sprint 3 owner | Evaluate Supabase RPC for true atomic decrement | Before production |

### 7.5 Compliance & Medical Industry Risks

**Severity: HIGH | Probability: UNKNOWN**

This is a medical supplies marketplace. Potential regulatory exposure:
- **HIPAA:** May apply if any patient data is handled. Current assessment: platform sells supplies, not services. No patient data collected in current schema. **Decision needed from client.**
- **PCI-DSS:** Payment processing offloaded to Stripe (PCI Level 1 compliant). Backend never handles card numbers. Current exposure is limited to Stripe API key management.
- **FDA:** May apply for certain medical device categories. **Decision needed from client on product categories.**

**Action:** Client must provide written confirmation of regulatory requirements before production launch. This is tracked in [REM-001](#8-remediation-tracker).

---

## 8. Remediation Tracker

Every gap identified in this SOP is tracked here with a specific owner, deadline, and verification method. This section is the enforcement mechanism for the entire document.

### REM-001: Deployment Target & SOW Resolution

| Field | Value |
|-------|-------|
| **Owner** | Sravya-Karra (engineering lead) |
| **Deadline** | Before Sprint 5 (Week 5) begins |
| **Action** | 1. Confirm deployment target with client (ECS vs Railway Docker). 2. Update SOW deployment section. 3. Update CLAUDE.md if target changes. 4. Confirm regulatory requirements with client. 5. Ensure all forward migrations have documented revert procedures. |
| **Verification** | Written confirmation from client on deployment target. Updated SOW committed to repo. |
| **Status** | OPEN |

### REM-002: Branch Protection & CODEOWNERS

| Field | Value |
|-------|-------|
| **Owner** | DevOps 360DMMC |
| **Deadline** | Within 48 hours of SOP approval |
| **Action** | Configure GitHub branch protection on `develop` and `main`: (1) Require 1 approving review (not author). (2) Require status checks: CI. (3) Dismiss stale reviews on new pushes. (4) Disable force push. (5) Require squash merge. (6) Enable auto-delete of merged branches. (7) Create `.github/CODEOWNERS` per Section 6.4. |
| **Verification** | Screenshot of branch protection settings. CODEOWNERS file committed. Test by attempting to merge a PR without approval (should be blocked). |
| **Status** | OPEN |

### REM-003: AI Governance Controls

| Field | Value |
|-------|-------|
| **Owner** | Sravya-Karra (engineering lead) |
| **Deadline** | Within 1 week of SOP approval |
| **Action** | 1. Create `docs/ai-prompts/` directory with a README explaining the format. 2. Create PR template (`.github/pull_request_template.md`) that includes AI risk tier classification prompt. 3. Conduct first monthly audit of existing merged PRs for attestation compliance. 4. Add AI contribution % to sprint retrospective agenda. |
| **Verification** | `docs/ai-prompts/README.md` exists. PR template committed. First audit completed and results documented. |
| **Status** | OPEN |

### REM-004: Incident Response Infrastructure

| Field | Value |
|-------|-------|
| **Owner** | Sravya-Karra (engineering lead) + DevOps 360DMMC |
| **Deadline** | Before production launch |
| **Action** | 1. Replace `console.*` with pino structured logger. 2. Add `x-request-id` correlation middleware. 3. Set up external uptime monitor on `/health`. 4. Configure error alerting (Sentry or hosting provider). 5. Verify Supabase backup configuration and document restore procedure. 6. Perform one DR drill. 7. Establish on-call rotation. 8. Create `docs/post-mortems/` directory. |
| **Verification** | Structured logs visible in production. Uptime monitor configured and sending test alerts. DR drill report documented. On-call schedule published. |
| **Status** | OPEN |

### REM-005: Security Tooling

| Field | Value |
|-------|-------|
| **Owner** | DevOps 360DMMC |
| **Deadline** | Within 2 weeks of SOP approval |
| **Action** | 1. Enable GitHub Dependabot on the repository. 2. Enable GitHub secret scanning (or add `gitleaks` to CI). 3. Run initial `npm audit` and resolve any high/critical findings. |
| **Verification** | Dependabot PR visible in repo. Secret scanning enabled in repo settings (screenshot). `npm audit --audit-level=high` exits 0 on develop branch. |
| **Status** | OPEN |

### REM-006: CI Pipeline Hardening

| Field | Value |
|-------|-------|
| **Owner** | Sravya-Karra |
| **Deadline** | Within 1 week of SOP approval |
| **Action** | 1. Add `coverageThreshold` to `jest.config.ts` (80% lines/functions/statements, 70% branches). 2. Change CI `npm test` to `npm test -- --coverage`. 3. Add `npm audit --audit-level=high` step to CI. 4. Add `code-scan` job for forbidden patterns. 5. Change ESLint `no-explicit-any` from `warn` to `error`. 6. Configure all new CI jobs as required status checks in branch protection. |
| **Verification** | CI pipeline runs all new checks on next PR. A test PR that violates coverage threshold is rejected. A test PR with `SELECT *` in source is rejected by code-scan. |
| **Status** | OPEN |

### REM-007: CORS Configuration

| Field | Value |
|-------|-------|
| **Owner** | Sravya-Karra |
| **Deadline** | Before production deploy |
| **Action** | Replace `cors()` in `src/index.ts` with environment-specific origin configuration: `cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') })`. Add `ALLOWED_ORIGINS` to env schema. |
| **Verification** | `src/index.ts` no longer calls `cors()` without config. Integration test verifies cross-origin request from disallowed origin is rejected. |
| **Status** | OPEN |

### REM-008: Per-Route Rate Limiting

| Field | Value |
|-------|-------|
| **Owner** | Sravya-Karra |
| **Deadline** | Before production deploy |
| **Action** | Add stricter rate limiters on `/api/auth` (e.g., 10 req/15min for login) and `/api/payments` (e.g., 20 req/15min). Keep global limiter as a fallback. |
| **Verification** | Integration test verifies that auth endpoint returns 429 after exceeding limit. |
| **Status** | OPEN |

---

## Appendix: Checklists

### A. Pre-Commit Checklist (Developer)

Enforcement: Husky pre-commit hook runs lint-staged (automated). Manual items are developer responsibility.

- [ ] Code compiles: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] No `any` types introduced
- [ ] No `SELECT *` queries
- [ ] No hardcoded secrets or URLs
- [ ] Commit message follows conventional format (`feat:`, `fix:`, `test:`, etc.)
- [ ] AI co-authorship trailer included if AI-assisted

### B. Pre-PR Checklist (Developer)

Enforcement: Reviewer verifies these items. Automated checks catch build/test/lint/coverage.

- [ ] Branch is up to date with `develop`
- [ ] All new endpoints have unit + integration tests
- [ ] PR description includes: summary, test plan, issue reference
- [ ] AI risk tier identified (Tier 1/2/3) if AI-assisted
- [ ] Prompt stored in `docs/ai-prompts/` if Tier 1
- [ ] Database migration included if schema changed
- [ ] `docs/DATABASE_SCHEMA.md` updated if migration added
- [ ] No stub code unless explicitly documented as out-of-scope

### C. PR Review Checklist (Reviewer)

Enforcement: Reviewer is accountable. Engineering lead audits monthly.

- [ ] CI is green (all automated gates pass)
- [ ] PR description has summary, test plan, and issue reference
- [ ] Business logic matches SOW requirements
- [ ] Security: auth, validation, RLS reviewed
- [ ] Error handling: no swallowed errors, no leaked internals
- [ ] Tests are meaningful (not just status code checks)
- [ ] No unnecessary dependencies
- [ ] If AI-assisted: reviewer can explain the code when asked
- [ ] If AI Tier 1/2: attestation comment posted (Section 3.2)
- [ ] If migration: `docs/DATABASE_SCHEMA.md` updated

### D. Production Deployment Checklist

Enforcement: Engineering lead must post completed checklist as comment on `main` PR before merge.

- [ ] All automated CI gates pass on merge commit
- [ ] Coverage thresholds met (>= 80% lines)
- [ ] `npm audit` — no high/critical vulnerabilities
- [ ] Migrations applied to staging and verified
- [ ] CORS configured for production origin
- [ ] Rate limiters configured per-route
- [ ] Stripe webhook signature verification implemented + tested
- [ ] Environment variables configured in secrets manager
- [ ] Health check responding on staging
- [ ] Structured logging producing output
- [ ] Uptime monitor configured
- [ ] Error alerting configured
- [ ] Rollback procedure tested on staging
- [ ] On-call engineer assigned for first 72 hours
- [ ] DR drill completed
- [ ] Engineering lead sign-off posted

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-17 | Engineering (AI-assisted) | Initial SOP based on codebase audit |
| 2.0 | 2026-02-17 | Engineering (AI-assisted) | Addressed 5 blocking issues: (1) Converted aspirational rules to enforceable controls with owners, deadlines, and verification. (2) Resolved deployment target conflict with evidence-based decision. (3) Added auditable AI governance: risk tiers, attestation requirements, prompt storage, monthly audits. (4) Added complete incident response: severity taxonomy, SLOs, on-call, DR/backup, observability requirements. (5) Replaced aspirational security gates with tooling, cadence, owners, and deadlines in remediation tracker. |

---

*This SOP is enforceable only after engineering leadership approval. All remediation items in Section 8 have assigned owners and deadlines. Compliance is verified through automated CI checks (Section 6.1), monthly PR audits (Section 6.2), and the remediation tracker (Section 8). The engineering lead is accountable for SOP compliance and conducts the next review on 2026-03-17.*
