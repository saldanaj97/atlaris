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
- PRs run CI checks (including migration drift checks).
- Vercel handles preview deployments natively for non-`main` branches.
- Neon/Vercel integration provisions per-branch preview databases.
- Schema diffs are posted back to PRs after successful preview deployments.
- Merging to `develop` deploys staging.
- Merging to `main` runs production DB migrations first, then deploys production app from GitHub Actions.

---

## Environments and ownership

| Environment | Source              | Owner                     | Notes                                                  |
| ----------- | ------------------- | ------------------------- | ------------------------------------------------------ |
| Local       | Your feature branch | You                       | `pnpm dev`                                             |
| Preview     | PR branch           | Vercel + Neon integration | Auto preview deploy via Vercel git integration         |
| Staging     | `develop`           | Vercel                    | Integration baseline                                   |
| Production  | `main`              | GitHub Actions + Vercel   | Migrate first in GH Action, then deploy via Vercel CLI |

---

## Workflow map (what each workflow does)

### 1) `.github/workflows/ci-pr.yml`

- Trigger: PRs to `develop` or `main`
- Runs: lint, type-check, dependency audit, build, unit tests, light integration tests
- Includes: migration drift check (`pnpm db:generate` must produce no uncommitted changes)
- Skips docs-only changes (`docs/**`, `**/*.md`, etc.)

### 2) `.github/workflows/preview-schema-diff.yml`

- Trigger: `deployment_status`
- Runs only when deployment status is `success` and environment contains `Preview`
- Purpose: post schema diff comment after preview deploy has completed and migrations were applied
- Behavior:
  - Resolves PR by deployment branch
  - Compares Neon branch `preview/<git-branch>` using `neondatabase/schema-diff-action@v1`
  - Reposts a PR comment with diff when present (keeps latest at bottom)
  - Deletes stale comment when diff is empty

### 3) `.github/workflows/ci-trunk.yml`

- Trigger: push to `develop` or `main` (plus merge queue)
- Runs: heavier integration and e2e/smoke validations on trunk branches

### 4) `.github/workflows/deploy-production-migrations.yml`

- Trigger: push to `main` (or manual dispatch)
- Purpose: apply production migrations first, then deploy production app
- Behavior:
  - Runs a preflight DB-change detector on `main` pushes
  - Honors `workflow_dispatch` input `deploy_migrations` to force-run (`true`) or skip (`false`)
  - Runs `pnpm db:migrate` against production DB when preflight says to run
  - Deploys production app with Vercel CLI only after migration job succeeds (or is skipped)

---

## End-to-end flow: PR lifecycle

1. You push to a feature branch and open a PR to `develop`.
2. `ci-pr.yml` validates code quality, tests, and migration drift.
3. Vercel creates/updates a preview deployment automatically.
4. Neon/Vercel integration provisions preview DB branch env vars for that deployment.
5. Preview build command runs migrations for preview (`pnpm db:migrate`) before `next build`.
6. `preview-schema-diff.yml` runs on successful preview deployment and comments schema diff on PR.

---

## End-to-end flow: trunk and production

### Merge to `develop`

- Runs `ci-trunk.yml`
- Vercel deploys staging

### Merge to `main`

- Runs `ci-trunk.yml`
- Runs `deploy-production-migrations.yml`
  - preflight
  - production migrations (if needed)
  - production app deploy

---

## Required platform configuration (outside this repo)

### GitHub secrets

- `NEON_API_KEY` (used by `preview-schema-diff.yml`)
- `NEON_PROJECT_ID` (used by `preview-schema-diff.yml`)
- `NEON_PROD_DATABASE_NAME` (optional override for schema diff DB; fallback is `neondb`)
- `DATABASE_URL_PROD` (used by production migration workflow)
- `DATABASE_URL_PROD_NON_POOLING` (used by production migration workflow)
- `VERCEL_TOKEN` (used by production deploy workflow)
- `VERCEL_ORG_ID` (used by production deploy workflow)
- `VERCEL_PROJECT_ID` (used by production deploy workflow)

### Vercel settings

Preview build command should be environment-aware:

```bash
if [ "$VERCEL_ENV" = "preview" ]; then pnpm db:migrate && next build --turbopack; else next build --turbopack; fi
```

Set preview deployment behavior so non-`main` branches get preview deployments.

If production is deployed by GitHub Actions workflow, disable direct auto-production deploy from Vercel git push to avoid race conditions.

Neon integration should use preview branch naming `preview/<git-branch>` and auto-clean obsolete branches.

---

## How to reason about failures quickly

### Preview deployed but no schema diff comment

- Check if deployment environment name contains `Preview`
- Confirm `preview-schema-diff.yml` ran on `deployment_status`
- Confirm `NEON_API_KEY` and `NEON_PROJECT_ID` are set
- Confirm branch name resolves to `preview/<git-branch>` in Neon

### PR fails migration drift check

- Run `pnpm db:generate` locally
- Commit generated files under `src/lib/db/migrations/`
- Push again

### Production deploy blocked

- Check `deploy-production-migrations.yml` preflight output (`reason`)
- If migrations ran, inspect `Run Drizzle migrations` logs
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

- `docs/context/ci/branching-strategy.md`
- `docs/rules/ci/development-workflow.md`
- `.github/workflows/ci-pr.yml`
- `.github/workflows/preview-schema-diff.yml`
- `.github/workflows/ci-trunk.yml`
- `.github/workflows/deploy-production-migrations.yml`
