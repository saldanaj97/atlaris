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
    │   Open PR ───────> CI PR checks (lint, type, unit, build)   │
    │                                                             │
    │   Merge to develop ──> Full CI ──> Deploy to Staging        │
    │                                                             │
    │   Merge to main ─────> Full CI ──> Deploy to Production     │
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
| **Staging**    | `develop`     | Vercel preview   | Integration testing |
| **Production** | `main`        | Production URL   | Live users          |

### Deployment Mechanism

The Next.js app deploys automatically via **Vercel GitHub integration**:

- Vercel watches the repo and builds on push
- Database migrations are handled separately by GitHub Actions

---

## CI Workflows Explained

We have 5 GitHub Actions workflows. Here's what each does:

### 1. `ci-pr.yml` - PR Validation

**Triggers:** Pull requests to `develop` or `main`

**What it runs:**

- Lint (ESLint)
- Type check (TypeScript)
- Build (Next.js)
- Unit tests (sharded across 2 runners)
- Light integration tests

**Purpose:** Fast feedback on PRs. Catches issues before merge.

### 2. `ci-trunk.yml` - Full CI + Deploy Triggers

**Triggers:** Push to `develop` or `main`

**What it runs:**

- Security audit (dependency vulnerabilities)
- Integration tests (full suite, sharded across 4 runners)
- E2E tests (full suite, sharded across 4 runners)
- Migration dry-run (validates schema changes)

**Then:**

- If `develop`: triggers staging deployment
- If `main`: triggers production deployment

**Purpose:** Comprehensive validation before deployment. This is the gate.

### 3. `deploy-staging.yml` - Staging Deployment

**Triggers:** Called by `ci-trunk.yml` after successful CI on `develop`

**What it does:**

- Wakes up Neon database (if scaled to zero)
- Runs database migrations (if migration files changed)
- Reports deployment status

**Note:** The Next.js app itself is deployed by Vercel, not this workflow.

### 4. `deploy-production.yml` - Production Deployment

**Triggers:** Called by `ci-trunk.yml` after successful CI on `main`

**What it does:** Same as staging, but against production database.

### 5. `codeql.yml` - Security Scanning

**Triggers:** PRs to `develop` or `main`, plus weekly schedule

**What it does:** Static analysis for security vulnerabilities in TypeScript code.

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
2. Wait for checks to pass
3. Request review from team
4. Address feedback
5. Get approval

### Step 5: Merge to Develop

When approved and CI passes:

1. Squash and merge (preferred) or merge commit
2. Delete your feature branch
3. Full CI runs (`ci-trunk.yml`)
4. Staging deploys automatically

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
6. Production deploys automatically

---

## Database Migrations

Migrations have special handling:

| Situation                  | What Happens                                 |
| -------------------------- | -------------------------------------------- |
| No migration files changed | Deploy workflow runs, migration step skipped |
| Migration files changed    | Migrations run against target environment    |

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

### "What if I need to test against staging?"

Your changes won't be on staging until merged to `develop`. Options:

- Use Vercel preview deployments (automatic for PRs)
- Ask for a temporary staging deployment of your branch
- Test locally with staging database credentials (if you have access)

### "How do I know what's deployed?"

- **Staging:** Whatever is on `develop` HEAD
- **Production:** Whatever is on `main` HEAD

Check the "Deployments" tab in GitHub or Vercel dashboard.

### "What's the staging branch?"

We don't use a `staging` branch anymore. The staging **environment** deploys from `develop`. This simplifies the workflow.

---

## Quick Reference

| I want to...                | Do this                                                 |
| --------------------------- | ------------------------------------------------------- |
| Start new feature           | Branch from `develop`                                   |
| Submit my work              | PR to `develop`                                         |
| Deploy to staging           | Merge to `develop`                                      |
| Release to production       | PR `develop` to `main`, then merge                      |
| Fix production bug (urgent) | Branch from `main`, PR to `main`, backport to `develop` |

---

## Related Files

- `.github/workflows/ci-pr.yml` - PR validation workflow
- `.github/workflows/ci-trunk.yml` - Full CI + deploy triggers
- `.github/workflows/deploy-staging.yml` - Staging deployment
- `.github/workflows/deploy-production.yml` - Production deployment
- `.github/workflows/codeql.yml` - Security scanning
- `docs/rules/ci/development-workflow.md` - Rules for agents/automation
