# CI/CD & Branching Strategy

**Audience:** New contributors and junior developers  
**Last Updated:** February 2026

## Overview

This document explains how code flows from your local machine to production.

---

## The Two Anchor Branches

We use two protected branches that serve as anchors for all development:

| Branch    | Purpose                                      | Deploys To             | When It Updates            |
| --------- | -------------------------------------------- | ---------------------- | -------------------------- |
| `develop` | **Integration anchor** - day-to-day baseline | Staging environment    | When PRs are merged        |
| `main`    | **Release anchor** - production baseline     | Production environment | When `develop` is promoted |

**Rule:** All feature work branches from `develop`. All releases come from `main`.

---

## Visual Flow

```
                           YOUR WORKFLOW
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   feature/xyz ──PR──> develop ──PR──> main                  │
    │        │                 │              │                   │
    │   Your work         Integration     Production              │
    │                      (Staging)                              │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘

                         WHAT RUNS WHEN
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   Open PR ───────> CI PR checks + preview deploy + schema diff│
    │                                                             │
    │   Merge to develop ──> Full CI ──> Vercel deploys staging   │
    │                                                             │
    │   Merge to main ─────> Full CI ──> Migrate DB ──> Deploy app│
    │                                                             │
    └─────────────────────────────────────────────────────────────┘
```

---

## Branch Naming Conventions

| Type    | Pattern                       | Example                     |
| ------- | ----------------------------- | --------------------------- |
| Feature | `feature/<short-description>` | `feature/user-profile-page` |
| Bug fix | `fix/<issue-or-description>`  | `fix/login-redirect-loop`   |
| Hotfix  | `hotfix/<description>`        | `hotfix/payment-timeout`    |
| Chore   | `chore/<description>`         | `chore/update-dependencies` |

---

## Environments

| Environment    | Branch Source | URL              | Purpose             |
| -------------- | ------------- | ---------------- | ------------------- |
| **Local**      | Your branch   | `localhost:3000` | Development         |
| **Preview**    | PR branch     | Vercel preview   | PR-level testing    |
| **Staging**    | `develop`     | Vercel preview   | Integration testing |
| **Production** | `main`        | Production URL   | Live users          |

### Deployment Mechanism

- **Preview**: Vercel native preview deployments on non-`main` branches.
- **Preview DB**: Neon/Vercel integration creates isolated preview branches.
- **Production**: `.github/workflows/deploy-production-migrations.yml` applies DB migrations first, then deploys app to Vercel production.

---

## CI Workflows Explained

We use 4 core GitHub Actions workflows plus a schema diff workflow:

### 1. `ci-pr.yml` - PR Validation

**Triggers:** Pull requests to `develop` or `main`

**What it runs:**

- Lint (ESLint)
- Type check (TypeScript)
- Security audit (dependency vulnerabilities)
- Migration drift check (`pnpm db:generate` must not change committed migration files)
- Build (Next.js)
- Unit tests
- Light integration tests

**Purpose:** Fast feedback on PRs before merge.

### 2. `ci-trunk.yml` - Full CI

**Triggers:** Push to `develop` or `main`

**What it runs:**

- Integration tests (full suite)
- E2E tests

**Purpose:** Comprehensive validation after merge.

### 3. `preview-schema-diff.yml` - Schema Diff After Preview Deployment

**Triggers:** `deployment_status` when Vercel preview deployment succeeds

**What it does:**

- Resolves PR from deployment ref
- Runs `neondatabase/schema-diff-action@v1` against `preview/<git-branch>`
- Reposts schema diff comment on PR when diff exists

**Purpose:** Show DB schema delta against real preview database state.

### 4. `deploy-production-migrations.yml` - Production Release Workflow

**Triggers:** Push to `main`, or `workflow_dispatch`

**What it does:**

- Preflight detects DB-related file changes
- Runs `pnpm db:migrate` against production when needed
- Deploys production app via Vercel CLI only after migration stage is successful (or skipped)

**Purpose:** Prevent app deploy-before-migration race conditions.

### 5. Preview Cleanup (Integration-managed)

Preview Neon branches are cleaned automatically by Neon/Vercel integration when git branches are deleted.

---

## The Complete Flow: From Idea to Production

### Step 1: Start your feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-feature
```

### Step 2: Do your work

If you changed DB schema:

```bash
pnpm db:generate
git add src/lib/db/migrations
git commit -m "feat: ..."
```

### Step 3: Push and open PR to `develop`

### Step 4: PR review process

1. CI runs automatically (`ci-pr.yml`)
2. Vercel preview deploy runs automatically
3. Schema diff comment appears after successful preview deploy
4. Address feedback and merge

### Step 5: Merge to `develop`

1. Full CI runs (`ci-trunk.yml`)
2. Vercel deploys staging

### Step 6: Release to production (`develop` -> `main`)

1. Merge release PR
2. Full CI runs
3. `deploy-production-migrations.yml` runs preflight
4. DB migrations run if needed
5. Production app deploy runs after migration stage

---

## Database Migrations

| Stage          | What happens                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **PR**         | Developer commits generated migrations; CI fails if `pnpm db:generate` would change committed migration files |
| **Preview**    | Vercel preview build runs `pnpm db:migrate`                                                                   |
| **Production** | `deploy-production-migrations.yml` runs preflight + `db:migrate` before production deploy                     |

Migration-related changes include:

- `src/lib/db/schema/**`
- `src/lib/db/migrations/**`
- `src/lib/db/enums.ts`
- `drizzle.config.ts`

---

## Common Questions

### Which branch should PRs target?

Target `develop` unless it is a true production hotfix.

### What if CI fails because migrations are out of sync?

Run `pnpm db:generate` locally, commit generated files, push again.

### How do I test against a real DB before merge?

Use the Vercel preview deployment URL; Neon integration provisions an isolated preview DB branch.

---

## Related Files

- `.github/workflows/ci-pr.yml` - PR validation
- `.github/workflows/ci-trunk.yml` - Full CI on trunk
- `.github/workflows/preview-schema-diff.yml` - Schema diff comments after preview deploys
- `.github/workflows/deploy-production-migrations.yml` - Production migration + deploy workflow
- `docs/rules/ci/development-workflow.md` - Rules for agents/automation
