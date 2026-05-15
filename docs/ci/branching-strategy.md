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
    │   Open PR ───────> CI PR checks + preview deploy              │
    │                                                             │
    │   Merge to develop ──> Full CI ──> DB migrations ──> Staging │
    │                                                             │
    │   Merge to main ─────> Full CI ──> DB migrations ──> Prod    │
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
- **Preview DB**: isolated preview Supabase Postgres per your Vercel + Supabase setup (set `POSTGRES_URL` for preview).
- **Staging**: `.github/workflows/staging-db-migrations.yaml` applies committed Supabase migrations to the staging Supabase project on `develop`.
- **Production**: `.github/workflows/production-db-migrations.yaml` applies committed Supabase migrations to the production Supabase project on `main`.

---

## CI Workflows Explained

We use 4 core GitHub Actions workflows:

### 1. `ci-pr.yml` - PR Validation

**Triggers:** Pull requests to `develop` or `main`

**What it runs:**

- Lint (Oxlint)
- Type check (TypeScript)
- Security audit (dependency vulnerabilities)
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

### 3. `staging-db-migrations.yaml` - Staging Database Migration Workflow

**Triggers:** Push to `develop`, or `workflow_dispatch`

**What it does:**

- Links the Supabase CLI to the project in `STAGING_PROJECT_ID`
- Runs `supabase db push`

**Purpose:** Keep the staging database aligned with committed migrations on `develop`.

### 4. `production-db-migrations.yaml` - Production Database Migration Workflow

**Triggers:** Push to `main`, or `workflow_dispatch`

**What it does:**

- Links the Supabase CLI to the project in `PRODUCTION_PROJECT_ID`
- Runs `supabase db push`

**Purpose:** Keep the production database aligned with committed migrations on `main`.

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
supabase migration new <descriptive_name>
# edit the generated SQL migration, then validate it locally with supabase db reset
git add supabase/migrations
git commit -m "feat: ..."
```

### Step 3: Push and open PR to `develop`

### Step 4: PR review process

1. CI runs automatically (`ci-pr.yml`)
2. Vercel preview deploy runs automatically
3. Address feedback and merge

### Step 5: Merge to `develop`

1. Full CI runs (`ci-trunk.yml`)
2. `staging-db-migrations.yaml` applies committed migrations to staging
3. Vercel deploys staging

### Step 6: Release to production (`develop` -> `main`)

1. Merge release PR
2. Full CI runs
3. `production-db-migrations.yaml` applies committed migrations to production
4. Production app deploy runs

---

## Database Migrations

| Stage          | What happens                                                           |
| -------------- | ---------------------------------------------------------------------- |
| **PR**         | Developer commits Supabase migration files under `supabase/migrations` |
| **Staging**    | `staging-db-migrations.yaml` runs `supabase db push` on `develop`      |
| **Production** | `production-db-migrations.yaml` runs `supabase db push` on `main`      |

Migration-related changes include:

- `supabase/schema/**`
- `supabase/migrations/**`
- `supabase/enums.ts`
- `supabase/config.toml`

---

## Common Questions

### Which branch should PRs target?

Target `develop` unless it is a true production hotfix.

### What if a migration workflow fails?

Check the GitHub Actions logs for `supabase db push`, confirm the branch is targeting the intended project secret, and fix the failing migration SQL in a follow-up commit.

### How do I test against a real DB before merge?

Use the Vercel preview deployment URL; ensure preview environment variables point at an isolated preview database.

---

## Related Files

- `.github/workflows/ci-pr.yml` - PR validation
- `.github/workflows/ci-trunk.yml` - Full CI on trunk
- `.github/workflows/staging-db-migrations.yaml` - Staging migration workflow
- `.github/workflows/production-db-migrations.yaml` - Production migration workflow
- `docs/rules/ci/development-workflow.md` - Rules for agents/automation
