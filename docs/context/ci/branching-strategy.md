# CI/CD & Branching Strategy

**Audience:** New contributors and junior developers  
**Last Updated:** February 2026

## Overview

This document explains how code flows from your local machine to production. Understanding this system is essential before making your first contribution.

---

## The Two Anchor Branches

We use two protected branches that serve as anchors for all development:

| Branch    | Purpose                                      | Deploys To             | When It Updates            |
| --------- | -------------------------------------------- | ---------------------- | -------------------------- |
| `develop` | **Integration anchor** - day-to-day baseline | Staging environment    | When PRs are merged        |
| `main`    | **Release anchor** - production baseline     | Production environment | When `develop` is promoted |

### What "Anchor" Means

An anchor branch is:

- The **base reference** for starting new work
- The branch that stays **continuously up to date**
- The branch you **compare against** when reviewing changes

**Rule:** All feature work branches from `develop`. All releases come from `main`.

---

## Visual Flow

```
                           YOUR WORKFLOW
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   feature/xyz ──PR──> develop ──PR──> main                  │
    │        │                 │              │                   │
    │        │                 │              │                   │
    │   Your work         Integration     Production              │
    │                      (Staging)                              │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘

                         WHAT RUNS WHEN
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   Open PR ───────> CI PR checks + deploy hook + schema diff  │
    │                                                             │
    │   Merge to develop ──> Full CI ──> Vercel deploys staging   │
    │                                                             │
    │   Merge to main ─────> Full CI ──> Deploy Production       │
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

**Keep names short, lowercase, hyphenated.** Your branch name appears in commit history.

---

## Environments

| Environment    | Branch Source | URL              | Purpose             |
| -------------- | ------------- | ---------------- | ------------------- |
| **Local**      | Your branch   | `localhost:3000` | Development         |
| **Preview**    | PR branch     | Vercel preview   | PR-level testing    |
| **Staging**    | `develop`     | Vercel preview   | Integration testing |
| **Production** | `main`        | Production URL   | Live users          |

### Deployment Mechanism

The Next.js app deploys automatically via **Vercel**:

- Vercel watches the repo and builds on push
- **Preview environments** are triggered from GitHub Actions via a Vercel Deploy Hook. Neon preview branches are provisioned by the Neon/Vercel integration during deploy.
- **Production** migrations run via `deploy-production-migrations.yml` when code is pushed to `main`

---

## CI Workflows Explained

We have 6 GitHub Actions workflows. Here's what each does:

### 1. `ci-pr.yml` - PR Validation

**Triggers:** Pull requests to `develop` or `main`

**What it runs:**

- Lint (ESLint)
- Type check (TypeScript)
- Security audit (dependency vulnerabilities)
- Build (Next.js)
- Unit tests (sharded across 2 runners)
- Light integration tests

**Purpose:** Fast feedback on PRs. Catches issues before merge.

### 2. `ci-trunk.yml` - Full CI

**Triggers:** Push to `develop` or `main`

**What it runs:**

- Integration tests (full suite, sharded across 2 runners)
- E2E tests (full suite, sharded across 2 runners)

**Purpose:** Comprehensive validation after merge. This is the gate for trunk.

### 3. `preview-db-migrations.yml` - Migration File Sync for Preview PRs

**Triggers:** PR opened, synchronize, or reopened to `develop` or `main`

**What it does:**

- Runs a preflight DB-change detector (no-op pass when DB-related files did not change)
- Runs `pnpm db:generate` using a placeholder `DATABASE_URL` (no DB connection required)
- Commits and pushes generated migration files back to the PR branch when schema changed
- Uses `[skip deploy]` in the commit message so Vercel ignores migration-only sync commits

**Purpose:** Keep migration files in sync with schema changes before preview deployments apply them.

**Required secrets:** None beyond `GITHUB_TOKEN`.

### 4. `vercel-preview-deploy.yml` - Trigger Vercel Preview Deploy

**Triggers:** PR opened, synchronize, or reopened to `develop` or `main`

**What it does:**

- Evaluates latest-commit path changes to avoid unnecessary deploy requests
- Skips deploy hook calls for migration sync commits tagged with `[skip deploy]`
- Calls the Vercel Preview Deploy Hook URL

**Purpose:** Keep preview deployments controlled by GitHub workflow triggers while still using Vercel-managed builds.

**Required secrets:** `VERCEL_PREVIEW_DEPLOY_HOOK_URL`.

### 5. `preview-schema-diff.yml` - Schema Diff After Preview Deployment

**Triggers:** `deployment_status` events when Vercel preview deployment succeeds

**What it does:**

- Resolves the PR from the deployment ref
- Runs `neondatabase/schema-diff-action@v1` against `preview/<git-branch>`
- Upserts a schema diff comment on the PR

**Purpose:** Show DB schema changes after preview migrations have actually been applied in Neon.

**Required secrets:** `NEON_API_KEY`, `NEON_PROJECT_ID` (plus custom DB name secret if not using `neondb`).

### 6. `deploy-production-migrations.yml` - Production Deployment

**Triggers:** Push to `main`, or `workflow_dispatch` (manual)

**What it does:**

- Runs a preflight DB-change detector on `main` pushes (no-op pass when DB-related files did not change)
- Optional `deploy_migrations` input on manual runs (force-run with `true`, skip with `false`)
- Runs Drizzle migrations against the production database only when preflight allows

**Purpose:** Apply schema changes to production after code lands on `main`.

**Note:** The Next.js app itself is deployed by Vercel on push. This workflow handles database migrations only.

### 7. Preview Cleanup (Integration-managed)

Preview Neon branches are cleaned up automatically by the Neon/Vercel integration when git branches are deleted.

---

## The Complete Flow: From Idea to Production

### Step 1: Start Your Feature

```bash
# Always start from develop
git checkout develop
git pull origin develop

# Create your feature branch
git checkout -b feature/my-feature
```

### Step 2: Do Your Work

Make commits as you go. Keep them small and focused.

```bash
git add <files>
git commit -m "feat: add user profile component"
```

### Step 3: Push and Open PR

```bash
# Push your branch
git push -u origin feature/my-feature

# Open PR targeting develop (not main!)
```

**PR Target:** `develop`

### Step 4: PR Review Process

1. CI runs automatically (`ci-pr.yml`)
2. Preview migrations sync runs (`preview-db-migrations.yml`) and preview deploy trigger runs (`vercel-preview-deploy.yml`)
3. Wait for checks to pass
4. Request review from team
5. Address feedback
6. Get approval

### Step 5: Merge to Develop

When approved and CI passes:

1. Squash and merge (preferred) or merge commit
2. Delete your feature branch
3. Full CI runs (`ci-trunk.yml`)
4. Vercel deploys staging from `develop`

### Step 6: Verify on Staging

- Check your changes on staging environment
- Run any manual verification needed
- If issues found, fix on a new branch (repeat from Step 1)

### Step 7: Release to Production

When ready to release:

1. Open PR from `develop` to `main`
2. This is a "release PR" - summarize what's shipping
3. Get approval
4. Merge
5. Full CI runs
6. `deploy-production-migrations.yml` runs migrations on production
7. Vercel deploys the Next.js app from `main`

---

## Database Migrations

Migrations are validated and applied at different stages:

| Stage          | What Happens                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR**         | `preview-db-migrations.yml` generates migration files, `vercel-preview-deploy.yml` triggers Vercel preview deploy, `preview-schema-diff.yml` comments DB diff |
| **Trunk**      | No migration dry-run (preview already validated on Neon)                                                                                                      |
| **Production** | `deploy-production-migrations.yml` runs preflight on push to `main`, then runs `db:migrate` only when DB-related files changed (or manual override)           |

**Migration files are detected by changes to:**

- `src/lib/db/migrations/*.sql`
- `src/lib/db/migrations/meta/**`
- `src/lib/db/schema/**`
- `src/lib/db/enums.ts`
- `drizzle.config.ts`

---

## Common Questions

### "Which branch do I target my PR to?"

**Almost always `develop`.**

The only exception is a production hotfix that cannot wait for the normal flow. In that case, you'd branch from `main`, fix, PR to `main`, then immediately backport to `develop`.

### "What if CI fails on my PR?"

1. Read the error logs in GitHub Actions
2. Fix the issue locally
3. Push again
4. CI re-runs automatically

### "What if I need to test against a real database?"

Each PR gets a preview deployment triggered by `vercel-preview-deploy.yml`, with a Neon branch provisioned by the Neon/Vercel integration. Use the Vercel preview URL plus the schema diff PR comment to validate against a real isolated database.

### "How do I know what's deployed?"

- **Staging:** Whatever is on `develop` HEAD
- **Production:** Whatever is on `main` HEAD

Check the "Deployments" tab in GitHub or Vercel dashboard.

### "What's the staging branch?"

We don't use a `staging` branch anymore. The staging **environment** deploys from `develop`. This simplifies the workflow.

---

## Quick Reference

| I want to...                   | Do this                                                 |
| ------------------------------ | ------------------------------------------------------- |
| Start new feature              | Branch from `develop`                                   |
| Submit my work                 | PR to `develop`                                         |
| Test with real DB before merge | Use the preview deployment URL from the PR comment      |
| Deploy to staging              | Merge to `develop`                                      |
| Release to production          | PR `develop` to `main`, then merge                      |
| Fix production bug (urgent)    | Branch from `main`, PR to `main`, backport to `develop` |

---

## Related Files

- `.github/workflows/ci-pr.yml` - PR validation workflow
- `.github/workflows/ci-trunk.yml` - Full CI on trunk
- `.github/workflows/preview-db-migrations.yml` - Migration generation and commit-back for PR previews
- `.github/workflows/vercel-preview-deploy.yml` - Triggers Vercel preview deploy hook
- `.github/workflows/preview-schema-diff.yml` - Schema diff comments after successful preview deployments
- `.github/workflows/deploy-production-migrations.yml` - Production migrations
- `docs/rules/ci/development-workflow.md` - Rules for agents/automation
