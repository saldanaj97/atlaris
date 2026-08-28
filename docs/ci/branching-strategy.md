# CI/CD & Branching Strategy

**Audience:** New contributors and junior developers  
**Last Updated:** August 2026

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
    │   Open PR ───────> CI PR checks + classified Preview deploy   │
    │                                                             │
    │   Merge to develop ──> Full CI ──> DB migrations ──> Staging │
    │                                                             │
    │   Merge to main ─────> Full CI ──> DB migrations (expand)    │
    │        ──> unaliased Production candidate                   │
    │        ──> approval + exact-candidate smoke ──> auto-alias  │
    │        ──> DB migrations (contract)                          │
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

| Environment | Branch Source | URL | Purpose |
| ----------- | ------------- | --- | ------- |
| **Local / Local Preview** | Your branch | `localhost:3000` | Development and local integration |
| **Preview** | PR branch | Vercel preview | PR-level testing |
| **Staging** | `develop` | Hosted staging / preview | Integration testing with non-Production services |
| **Staged Production** | Exact `main` SHA | Protected generated Vercel URL | Production build + Production config **without** moving public domains |
| **Live Production** | Approved exact candidate | Production URL | Live users after JCS-52 passes and Vercel aliases automatically |

### Deployment Mechanism

- **Preview**: same-repository deploy-impacting PRs use the custom-CI Preview lane; docs-only PRs create no deployment and forks receive no secrets.
- **Preview DB**: isolated preview Supabase Postgres per your Vercel + Supabase setup (set `POSTGRES_URL` for preview).
- **Staging**: operators dispatch `.github/workflows/staging-db-migrations.yaml` from `develop` in explicit expand and contract phases; the Hobby-plan app lane uses Vercel Preview configuration scoped to `develop`.
- **Staged Production**: after native Git cutover, a deploy-impacting `main` push creates an unaliased Production-targeted candidate. The job remains skipped until `VERCEL_NATIVE_GIT_DISABLED=true`. JCS-52 gates automatic aliasing on approval and exact-candidate smoke; routine `vercel promote` is not used. See [staged-production-deployment.md](../ci-cd/staged-production-deployment.md).
- **Production migrations**: operators dispatch `.github/workflows/production-db-migrations.yaml` from `main` in explicit expand (before exercising the Production binary) and contract (after alias assignment + health) phases.

---

## CI Workflows Explained

PR validation is CircleCI `ci-pr`. Trunk integration after merge to `develop`/`main` is CircleCI `ci-trunk` only.

### 1. CircleCI `ci-pr` - PR Validation

**Triggers:** GitHub App `pull_request` events whose head is not `main` (feature/hotfix PRs plus the `develop` → `main` promotion PR)

**What it runs:**

- Lint (Oxlint)
- Type check (TypeScript)
- Security audit (dependency vulnerabilities)
- Build (Next.js)
- Unit tests
- Integration tests (related for small source diffs, full for global or broad diffs, light only when no suitable source candidates)
- RLS security tests
- Production workflow tests

**Purpose:** Fast feedback on PRs before merge. GitHub rulesets require these job names, not a GitHub Actions aggregator.

### 2. CircleCI `ci-trunk` - Full CI (post-merge)

**Triggers:** **All pushes** to `develop` or `main` (not `pull_request` events). Keep the CircleCI GitHub App **All pushes** trigger.

**What it runs:**

- Integration tests (full suite)
- RLS security tests

**Purpose:** Comprehensive validation after merge. Browser smoke (`pnpm test:smoke`) is supported locally but is not a hosted CI gate.

**Known gaps:** CircleCI has no `merge_group` trigger. Codecov upload is still absent (workflow status is the gate). Jobs use a CircleCI Postgres sidecar, not Testcontainers.

### 3. `staging-db-migrations.yaml` - Staging Database Migration Workflow

**Trigger:** Manual `workflow_dispatch` from `develop`

**What it does:**

- Skips any run whose ref is not `refs/heads/develop`
- Checks out `develop`
- Links the Supabase CLI to the project in `STAGING_PROJECT_ID`
- `expand` applies and records only the explicit safe migration list
- `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`

**Purpose:** Preserve expand/deploy/contract ordering for the staging database.

### 4. `production-db-migrations.yaml` - Production Database Migration Workflow

**Trigger:** Manual `workflow_dispatch` from `main`

**What it does:**

- Skips any run whose ref is not `refs/heads/main`
- Checks out `main`
- Links the Supabase CLI to the project in `PRODUCTION_PROJECT_ID`
- `expand` applies and records only the explicit safe migration list
- `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`

**Purpose:** Preserve expand/deploy/contract ordering for the production database.

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

1. CI runs automatically (CircleCI `ci-pr`)
2. The deployment classifier runs; a same-repository deploy-impacting PR creates a custom-CI Preview deployment
3. Address feedback and merge

### Step 5: Merge to `develop`

1. Full CI runs (CircleCI `ci-trunk`)
2. An operator dispatches `staging-db-migrations.yaml` phase `expand`
3. A deploy-impacting change creates the `develop` Preview fallback; after health verification, the operator dispatches phase `contract`

### Step 6: Release to production (`develop` -> `main`)

1. Merge release PR
2. Full CI runs (CircleCI `ci-trunk`; `integration-tests` / `security-tests` skip when `detect-changes` finds no integration-path files)
3. An operator dispatches `production-db-migrations.yaml` phase `expand` when schema changes require it
4. The **Staged Production** lane creates an unaliased candidate; JCS-52 approval and exact-candidate smoke gate Vercel's automatic alias assignment. See [staged-production-deployment.md](../ci-cd/staged-production-deployment.md).
5. After alias assignment + health/archive checks, the operator dispatches phase `contract`

---

## Database Migrations

| Stage          | What happens                                                           |
| -------------- | ---------------------------------------------------------------------- |
| **PR**         | Developer commits Supabase migration files under `supabase/migrations` |
| **Staging**    | Operator dispatches `expand`, deploys, verifies health, then dispatches confirmed `contract` on `develop` |
| **Production** | Operator dispatches `expand`, verifies the unaliased candidate, waits for JCS-52-gated automatic aliasing, then dispatches confirmed `contract` on `main` |

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

Check the GitHub Actions logs for `supabase db push`, confirm the run used the intended environment and branch (`develop` for staging, `main` for production), and fix the failing migration SQL in a follow-up commit.

### How do I test against a real DB before merge?

Use the Vercel preview deployment URL; ensure preview environment variables point at an isolated preview database.

---

## Related Files

- `.circleci/config.yml` - PR validation (`ci-pr`) and trunk (`ci-trunk`)
- `.github/workflows/staging-db-migrations.yaml` - Staging migration workflow
- `.github/workflows/production-db-migrations.yaml` - Production migration workflow
- `.github/workflows/vercel-deploy.yml` - deployment decision and custom Vercel lanes
- `docs/ci-cd/pipeline-and-deployment-strategy.md` - Deployment pipeline details
