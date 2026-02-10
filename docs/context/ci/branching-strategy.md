# CI/CD & Branching Strategy

**Audience:** New contributors and junior developers  
**Last Updated:** February 2025

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
    │   Open PR ───────> CI PR checks + Deploy Preview (Neon)     │
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
- **Preview environments** use Neon branching (ephemeral DB per PR) via `deploy-preview.yml`
- **Production** migrations run via `deploy-production.yml` when code is pushed to `main`

---

## CI Workflows Explained

We have 5 GitHub Actions workflows. Here's what each does:

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

### 3. `deploy-preview.yml` - Preview Environments (Neon Branching)

**Triggers:** PR opened, synchronize, or reopened to `develop` or `main`

**What it does:**

- Creates a Neon database branch from the parent
- Runs Drizzle migrations on the ephemeral branch
- Posts schema diff (preview vs parent) as a PR comment
- Builds and deploys to Vercel with the preview branch URL
- Comments the preview URL and Neon branch link on the PR

**Purpose:** Each PR gets an isolated preview with its own database. Migrations are validated on Neon before merge.

**Required secrets:** `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PREVIEW_DATABASE_ROLE`, `NEON_PREVIEW_DATABASE_NAME`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### 4. `deploy-production.yml` - Production Deployment

**Triggers:** Push to `main`, or `workflow_dispatch` (manual)

**What it does:**

- Runs Drizzle migrations against the production database
- Optional `deploy_migrations` input (default: true) to skip migrations on manual runs

**Purpose:** Apply schema changes to production after code lands on `main`.

**Note:** The Next.js app itself is deployed by Vercel on push. This workflow handles database migrations only.

### 5. `cleanup-preview.yml` - Preview Cleanup

**Triggers:** PR closed

**What it does:**

- Deletes the Neon branch created for that PR

**Purpose:** Avoid orphaned Neon branches and control costs.

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
2. Preview deployment runs (`deploy-preview.yml`) — you get a live preview with its own Neon DB
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
6. `deploy-production.yml` runs migrations on production
7. Vercel deploys the Next.js app from `main`

---

## Database Migrations

Migrations are validated and applied at different stages:

| Stage          | What Happens                                                |
| -------------- | ----------------------------------------------------------- |
| **PR**         | `deploy-preview.yml` runs `db:migrate` on a Neon branch     |
| **Trunk**      | No migration dry-run (preview already validated on Neon)    |
| **Production** | `deploy-production.yml` runs `db:migrate` on push to `main` |

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

Each PR gets a preview deployment with its own Neon branch. The preview URL and Neon branch link are posted as a PR comment. Use that to test against a real database without affecting staging or production.

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
- `.github/workflows/deploy-preview.yml` - Preview environments (Neon branching)
- `.github/workflows/deploy-production.yml` - Production migrations
- `.github/workflows/cleanup-preview.yml` - Preview branch cleanup
- `docs/rules/ci/development-workflow.md` - Rules for agents/automation
