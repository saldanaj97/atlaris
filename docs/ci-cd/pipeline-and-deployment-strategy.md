# CI/CD Pipeline and Deployment Strategy

**Audience:** New engineers (especially junior hires)  
**Last Updated:** February 2026

## Why this exists

This document explains how code moves from a feature branch to preview, staging, and production.

The pipeline intentionally favors safety on production DB changes: migrations run before production deploy.

---

## The short version

- Start work from `develop`.
- Open PRs into `develop` (or `main` only for true hotfixes).
- PRs run CI checks.
- Vercel handles preview deployments natively for non-`main` branches.
- Preview databases are provisioned per your Vercel/Supabase setup; wire `POSTGRES_URL` for each preview environment there.
- Merging to `develop` runs Supabase CLI migrations against staging.
- Merging to `main` runs Supabase CLI migrations against production.

---

## Environments and ownership

| Environment | Source              | Owner                      | Notes                                                      |
| ----------- | ------------------- | -------------------------- | ---------------------------------------------------------- |
| Local       | Your feature branch | You                        | `pnpm dev`                                                 |
| Preview     | PR branch           | Vercel (+ hosted Postgres) | Auto preview deploy via Vercel git integration             |
| Staging     | `develop`           | GitHub Actions + Vercel    | Supabase migrations target the staging Supabase project    |
| Production  | `main`              | GitHub Actions + Vercel    | Supabase migrations target the production Supabase project |

---

## Workflow map (what each workflow does)

### 1) `.github/workflows/ci-pr.yml`

- Trigger: PRs to `develop` or `main`
- Runs: lint, type-check, dependency audit, build, unit tests, and PR integration tests (related for small source diffs, full for global or broad diffs, light only when no suitable source candidates)
- Skips docs-only changes (`docs/**`, `**/*.md`, etc.)

### 2) `.github/workflows/ci-trunk.yml`

- Trigger: push to `develop` or `main` (plus merge queue)
- Runs: full integration and RLS security checks on trunk branches
- Browser smoke is a supported local command (`pnpm test:smoke`), not a hosted CI gate

### 3) `.github/workflows/staging-db-migrations.yaml`

- Trigger: manual dispatch from `develop`
- Purpose: apply the explicit safe expand set, then apply remaining contract migrations only after deploy health confirmation
- Behavior:
  - Skips any run whose ref is not `refs/heads/develop`
  - Checks out `develop`
  - Links the Supabase CLI to `STAGING_PROJECT_ID`
  - `expand` applies and records only the workflow's safe migration list
  - `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`

### 4) `.github/workflows/production-db-migrations.yaml`

- Trigger: manual dispatch from `main`
- Purpose: apply the explicit safe expand set, then apply remaining contract migrations only after deploy health confirmation
- Behavior:
  - Skips any run whose ref is not `refs/heads/main`
  - Checks out `main`
  - Links the Supabase CLI to `PRODUCTION_PROJECT_ID`
  - `expand` applies and records only the workflow's safe migration list
  - `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`

---

## End-to-end flow: PR lifecycle

1. You push to a feature branch and open a PR to `develop`.
2. `ci-pr.yml` validates code quality and tests.
3. Vercel creates/updates a preview deployment automatically.
4. Configure preview Supabase settings in Vercel if preview deployments need a database.

---

## End-to-end flow: trunk and production

### Merge to `develop`

- Runs `ci-trunk.yml`
- Requires an operator to run `staging-db-migrations.yaml` phase `expand` before deployment and phase `contract` after health verification
- Vercel deploys staging

### Merge to `main`

- Runs `ci-trunk.yml`
- Requires an operator to run `production-db-migrations.yaml` phase `expand` before deployment and phase `contract` after health verification

---

## Required platform configuration (outside this repo)

### GitHub environment gates

Create protected GitHub environments named `staging` and `production`.

| Environment  | Deployment branch rule | Required reviewers |
| ------------ | ---------------------- | ------------------ |
| `staging`    | `develop`              | Yes                |
| `production` | `main`                 | Yes                |

Store the Supabase migration secrets below as environment secrets on the matching environment, not as broad repository secrets.

### GitHub environment secrets

- `SUPABASE_ACCESS_TOKEN` (set separately on `staging` and `production`)
- `STAGING_PROJECT_ID` (set on `staging`)
- `STAGING_DB_PASSWORD` (set on `staging`)
- `PRODUCTION_PROJECT_ID` (set on `production`)
- `PRODUCTION_DB_PASSWORD` (set on `production`)

### GitHub repository secrets

- `VERCEL_TOKEN` (used by production deploy workflow)
- `VERCEL_ORG_ID` (used by production deploy workflow)
- `VERCEL_PROJECT_ID` (used by production deploy workflow)

### Vercel settings

Set preview deployment behavior so non-`main` branches get preview deployments.

If production is deployed by GitHub Actions workflow, disable direct auto-production deploy from Vercel git push to avoid race conditions.

---

## How to reason about failures quickly

### Supabase migration workflow fails

- Confirm the workflow is using the intended project secret (`STAGING_PROJECT_ID` for `develop`, `PRODUCTION_PROJECT_ID` for `main`).
- Confirm `SUPABASE_ACCESS_TOKEN` and the matching database password secret are set.
- Confirm the selected branch is `develop` for staging or `main` for production. Other refs are skipped before checkout.
- For `contract`, confirm rollout health and the Stripe archive counts before entering `post-deploy-health-verified`.
- Inspect the `supabase db push` logs for the failing migration file.

### Production deploy blocked

- Check `production-db-migrations.yaml`
- If migrations ran, inspect the `supabase db push` logs
- Verify Vercel secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) for deployment stage

---

## Guardrails (do not bypass)

- Do not push directly to `develop` or `main`
- Do not force-push shared branches
- Do not skip CI checks to "unblock" deploys
- Do not run service-role DB client in request handlers
- Do not rely on CI to generate migrations for you; migration files must be committed with schema changes

---

## Related docs

- `docs/ci/branching-strategy.md`
- `.github/workflows/ci-pr.yml`
- `.github/workflows/ci-trunk.yml`
- `.github/workflows/staging-db-migrations.yaml`
- `.github/workflows/production-db-migrations.yaml`
