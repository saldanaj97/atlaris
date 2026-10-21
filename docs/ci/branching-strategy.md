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

### No long-lived integration branches

Every PR targets `develop` directly, including each slice of a multi-PR project. Do not create a track branch that collects slices and then needs its own "bring to develop" PR: each change would cross three PRs instead of one. Short-lived stacked PRs, which each merge into `develop` in turn, are fine.

Land unfinished user-facing behavior on `develop` behind a flag in `src/flags.ts` with `defaultValue: false`, and keep the new path fail-closed until the flag is turned on. Remove the flag once the work ships.

### Batched promotions

Promote `develop` to `main` in batches: at most once a day, or when a milestone is ready. Do not open a promotion after every merge. The only exception is the urgent hotfix path in [pipeline-and-deployment-strategy.md](../ci-cd/pipeline-and-deployment-strategy.md#urgent-production-hotfix).

Merge the promotion PR with **Create a merge commit**. A squash or rebase merge gives `main` a commit that `develop` lacks, so the next promotion conflicts until someone merges `main` back into `develop`. A merge commit keeps the promoted `develop` commit in `main`'s history, so the next promotion merges cleanly and no merge-back is needed. Merge `main` back into `develop` only after a hotfix lands on `main`.

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
    │   Open PR ───────> CircleCI PR checks (incl. `build`)         │
    │                                                             │
    │   Merge to develop ──> Full CI ──> DB migrations ──> Staging │
    │                                                             │
    │   Merge to main ─────> Full CI ──> DB migrations (expand)    │
    │        ──> native Production deployment                     │
    │        ──> JCS-52 Deployment Checks ──> alias gate          │
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
| **Preview** | `develop` and `hotfix/*` | Vercel preview | Staging build for `develop`; `hotfix/*` previews give hotfix PRs into `main` the required Vercel status. Feature branches get no Vercel deployment |
| **Staging** | `develop` | Hosted staging / preview | Integration testing with non-Production services |
| **Staged Production proof** | Exact `main` SHA on `origin/main` | Protected generated Vercel URL | Post-push unaliased rehearsal; does not govern native Production aliases or domains |
| **Live Production** | `main` | Production URL | Live users after native Vercel deployment; JCS-52 will add Deployment Checks for Production gating |

### Deployment Mechanism

- **Preview**: Vercel's Git integration builds a Preview deployment for `develop` (staging) and `hotfix/*` branches (so hotfix PRs into `main` still get the required Vercel status); feature branches are not deployed. For a per-PR URL, use the local dev server (`pnpm dev`) or a one-off `vercel deploy`. The PR build gate is CircleCI `build`.
- **Preview DB**: isolated preview Supabase Postgres per your Vercel + Supabase setup (set `POSTGRES_URL` for preview).
- **Staging**: the `develop` branch's Vercel Preview deployment is the hosted staging surface; use non-Production services and dispatch migration phases when needed.
- **Staged Production**: before JCS-52, operators run a post-push unaliased rehearsal from a clean checkout after the exact `main` SHA exists on `origin/main`; it does not govern native Production alias/domain assignment. Only JCS-52's native Vercel Deployment Check enforced by Deployment Protection can gate live alias assignment. See [staged-production-deployment.md](../ci-cd/staged-production-deployment.md).
- **Production migrations**: operators dispatch `.github/workflows/production-db-migrations.yaml` from `main` in explicit expand (before exercising the Production binary) and contract (after alias assignment + health) phases.

---

## CI Workflows Explained

PR validation is CircleCI `ci-pr`. Trunk integration after merge to `develop`/`main` is CircleCI `ci-trunk` only.

CircleCI `build` is the PR gate for the Next.js build: it runs `pnpm build` with no secrets (Sentry auth token blanked, so no release or source-map upload). Vercel builds Preview for `develop` (staging) and `hotfix/*` branches (so hotfix PRs into `main` still get the required Vercel status) and Production for `main`; feature branches get no Vercel deployment.

### 1. CircleCI `ci-pr` - PR Validation

**Triggers:** GitHub App `pull_request` events whose head is not `main` (feature/hotfix PRs plus the `develop` → `main` promotion PR); draft PRs wait until marked ready for review

**What it runs:**

- Next.js build (`pnpm build`, the required `build` job; skipped when `detect-changes` finds no `source`, `integration` or `.circleci/` changes, except on PRs into `main`)
- Lint (Oxlint)
- Type check (TypeScript)
- Security audit (dependency vulnerabilities)
- Unit tests
- Integration tests (related for small source diffs, full for global or broad diffs, light only when no suitable source candidates)
- RLS security tests (skipped when `detect-changes` finds no integration-path files, except on PRs into `main`)
- Dependency remediation tests (the required `dependency-remediation-tests` job; skipped unless the diff touches `.github/scripts/`, the remediation workflow, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `.circleci/`)

**Purpose:** Fast feedback on PRs before merge. The `development` (`develop`) GitHub ruleset requires the seven CircleCI validation job names (`build` plus the six below) and not the `Vercel` status or a GitHub Actions aggregator.

### 2. CircleCI `ci-trunk` - Full CI (post-merge)

**Triggers:** **All pushes** to `develop` or `main` (not `pull_request` events). Keep the CircleCI GitHub App **All pushes** trigger.

**What it runs:**

- Unit tests (full suite, `develop` only; PRs run only impacted unit tests, so this surfaces selection misses before promotion)
- Integration tests (full suite)
- RLS security tests

**Purpose:** Comprehensive validation after merge. Browser smoke (`pnpm test smoke`) is supported locally but is not a hosted CI gate.

**Known gaps:** CircleCI has no `merge_group` trigger. Codecov upload is still absent (workflow status is the gate). Jobs use a CircleCI Postgres sidecar, not Testcontainers.

### 3. `staging-db-migrations.yaml` - Staging Database Migration Workflow

**Trigger:** Manual `workflow_dispatch` from `develop`

**What it does:**

- `validate-dispatch` fails (does not skip) when the ref is not `refs/heads/develop`
- Checks out the dispatch SHA (`${{ github.sha }}`)
- Links the Supabase CLI to the project in `STAGING_PROJECT_ID`
- `expand` applies only pending `EXPAND_MIGRATIONS` in a phase-specific workspace via `supabase migration up --linked --include-all --yes`
- `contract` requires `post-deploy-health-verified`, applies only pending `CONTRACT_MIGRATIONS` the same way, and fails if any expand migration is still pending

**Purpose:** Preserve expand/deploy/contract ordering for the staging database.

### 4. `production-db-migrations.yaml` - Production Database Migration Workflow

**Trigger:** Manual `workflow_dispatch` from `main`

**What it does:**

- `validate-dispatch` fails (does not skip) when the ref is not `refs/heads/main`
- Checks out the dispatch SHA (`${{ github.sha }}`)
- Links the Supabase CLI to the project in `PRODUCTION_PROJECT_ID`
- `expand` applies only pending `EXPAND_MIGRATIONS` in a phase-specific workspace via `supabase migration up --linked --include-all --yes`
- `contract` requires `post-deploy-health-verified`, applies only pending `CONTRACT_MIGRATIONS` the same way, and fails if any expand migration is still pending

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

1. CircleCI `ci-pr` runs code and test validation
2. CircleCI `build` validates the Next.js build; docs-only PRs report `build` as a no-op
3. Address feedback and merge

### Step 5: Merge to `develop`

1. Full CI runs (CircleCI `ci-trunk`)
2. Vercel builds the `develop` Preview as the hosted staging surface
3. An operator dispatches `staging-db-migrations.yaml` phases as needed, with `contract` only after health verification

### Step 6: Release to production (`develop` -> `main`)

1. Merge release PR
2. Full CI runs (CircleCI `ci-trunk`; `integration-tests` / `security-tests` skip when `detect-changes` finds no integration-path files)
3. An operator dispatches `production-db-migrations.yaml` phase `expand` when schema changes require it
4. Vercel's Git integration creates the Production deployment for the `main` push. Before JCS-52 is available, use the post-push unaliased rehearsal from a clean checkout after that SHA exists on `origin/main`; it does not govern native Production alias/domain assignment. Only JCS-52's native Vercel Deployment Check enforced by Deployment Protection can gate live alias assignment. See [staged-production-deployment.md](../ci-cd/staged-production-deployment.md).
5. After alias assignment + health/archive checks, the operator dispatches phase `contract`

---

## Database Migrations

| Stage          | What happens                                                           |
| -------------- | ---------------------------------------------------------------------- |
| **PR**         | Developer commits Supabase migration files under `supabase/migrations` |
| **Staging**    | Migration changes: operator dispatches `expand`, verifies the native `develop` Preview, then dispatches confirmed `contract` |
| **Production** | Operator dispatches `expand`, verifies the native `main` release is healthy, then dispatches confirmed `contract` on `main`; after JCS-52 is operational, its native Deployment Checks gate automatic aliasing, while native `main` traffic is independent before then |

Migration-related changes include:

- `supabase/schema/**`
- `supabase/migrations/**`
- `supabase/enums.ts`
- `supabase/config.toml`

---

## Common Questions

### Which branch should PRs target?

Target `develop` unless it is a true production hotfix. Never target a long-lived track branch (short-lived stacked PRs are fine); see [No long-lived integration branches](#no-long-lived-integration-branches).

### How often do we promote to `main`?

In batches, at most once a day or per milestone, merged with a merge commit. See [Batched promotions](#batched-promotions).

### What if a migration workflow fails?

Check the GitHub Actions logs for `supabase migration up`, confirm the run used the intended environment and branch (`develop` for staging, `main` for production; wrong refs fail `validate-dispatch`), and fix the failing migration SQL in a follow-up commit.

### How do I test against a real DB before merge?

Run the local dev server (`pnpm dev`) against a local or isolated database, or the `develop` Preview for staging. Feature branches have no Vercel Preview (only `develop` and `hotfix/*` do); for a one-off hosted check, run `vercel deploy` with preview environment variables pointing at an isolated preview database.

---

## Related Files

- `.circleci/config.yml` - PR validation (`ci-pr`) and trunk (`ci-trunk`)
- `.github/workflows/staging-db-migrations.yaml` - Staging migration workflow
- `.github/workflows/production-db-migrations.yaml` - Production migration workflow
- `docs/ci-cd/pipeline-and-deployment-strategy.md` - Deployment pipeline details
