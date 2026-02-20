# CI/CD Pipeline and Deployment Strategy

**Audience:** New engineers (especially junior hires)  
**Last Updated:** February 2026

## Why this exists

This document explains exactly how code moves from a branch to staging and production, and how preview deployments work in this repo.

If you are new, read this once before opening your first PR.

---

## The short version

- Start work from `develop`.
- Open PRs into `develop` (or `main` only for true hotfixes).
- PRs run CI checks, sync migration files, and trigger preview deploys through a Vercel deploy hook.
- Vercel + Neon integration provisions a preview database branch during deploy.
- Schema diffs are posted back to the PR after preview deployment succeeds.
- Merging to `develop` deploys staging.
- Merging to `main` runs production DB migrations and deploys production app.

---

## Environments and ownership

| Environment | Source              | Owner                                       | Notes                                                           |
| ----------- | ------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Local       | Your feature branch | You                                         | `pnpm dev`                                                      |
| Preview     | PR branch           | GitHub Actions trigger + Vercel build       | Triggered by deploy hook, DB branch created by Neon integration |
| Staging     | `develop`           | Vercel                                      | Integration baseline                                            |
| Production  | `main`              | Vercel + `deploy-production-migrations.yml` | App deploy via Vercel, DB migrate via GitHub Actions            |

---

## Workflow map (what each workflow does)

### 1) `.github/workflows/ci-pr.yml`

- Trigger: PRs to `develop` or `main`
- Runs: lint, type-check, dependency audit, build, unit tests, light integration tests
- Skips docs-only changes (`docs/**`, `**/*.md`, etc.)

### 2) `.github/workflows/preview-db-migrations.yml`

- Trigger: PR opened/synchronize/reopened to `develop` or `main`
- Purpose: keep migration files in sync with schema code
- Behavior:
  - Runs a preflight DB-change detector (no-op pass when DB-related files did not change)
  - On PR `synchronize`, checks only newly pushed commits (not entire PR history)
  - Runs `pnpm db:generate` with placeholder `DATABASE_URL`
  - Commits generated migrations back to the PR branch
  - Reposts a tagged PR status comment (`preview-db-migrations-status`) with decision reason and outcome
  - Uses `[skip deploy]` in commit message so deploy-trigger logic can ignore migration-only sync commits

### 3) `.github/workflows/vercel-preview-deploy.yml`

- Trigger: PR opened/synchronize/reopened to `develop` or `main` (selected paths)
- Purpose: trigger preview deploys only when appropriate
- Behavior:
  - Checks latest commit paths for deploy-relevant changes
  - Skips if commit message has `[skip deploy]`
  - Calls `VERCEL_PREVIEW_DEPLOY_HOOK_URL`
  - Prints preflight logs (`branch_name`, `run_deploy`, `reason`) for debugging
  - Reposts a tagged PR status comment (`preview-deploy-trigger-status`) with trigger/skip reason and outcome

### 4) `.github/workflows/preview-schema-diff.yml`

- Trigger: `deployment_status`
- Runs only when deployment status is `success` and environment contains `Preview`
- Purpose: post schema diff comment after preview deploy has completed and migrations were applied
- Behavior:
  - Resolves PR by deployment branch
  - Compares Neon branch `preview/<git-branch>` using `neondatabase/schema-diff-action@v1`
  - Reposts a PR comment tagged `preview-deployment` with Vercel Preview + Neon branch links (keeps latest at bottom)
  - Reposts a PR comment with diff when present (keeps latest at bottom)
  - Deletes stale comment when diff is empty

### 5) `.github/workflows/ci-trunk.yml`

- Trigger: push to `develop` or `main` (plus merge queue)
- Runs: heavier integration and e2e/smoke validations on trunk branches

### 6) `.github/workflows/deploy-production-migrations.yml`

- Trigger: push to `main` (or manual dispatch)
- Purpose: apply production database migrations
- Behavior:
  - Runs a preflight DB-change detector on `main` pushes (no-op pass when DB-related files did not change)
  - Honors `workflow_dispatch` input `deploy_migrations` to force-run (`true`) or skip (`false`)
  - Generates migration files
  - Commits them if needed
  - Runs `pnpm db:migrate` against production DB when preflight says to run

---

## End-to-end flow: PR lifecycle

1. You push to a feature branch and open a PR to `develop`.
2. `ci-pr.yml` validates code quality and tests.
3. `preview-db-migrations.yml` generates and commits migrations if schema changed.
4. `vercel-preview-deploy.yml` triggers Vercel Preview deploy hook (unless skipped).
5. Vercel builds the app.
6. Neon/Vercel integration provisions the preview DB branch and injects DB env vars.
7. Vercel applies `db:migrate` as part of preview build command.
8. `preview-schema-diff.yml` runs on successful deployment and comments schema diff on PR.

---

## End-to-end flow: trunk and production

### Merge to `develop`

- Runs `ci-trunk.yml`
- Vercel deploys staging

### Merge to `main`

- Runs `ci-trunk.yml`
- Runs `deploy-production-migrations.yml` for database migrations
- Vercel deploys production app

---

## Required platform configuration (outside this repo)

### GitHub secrets

- `VERCEL_PREVIEW_DEPLOY_HOOK_URL` (used by `vercel-preview-deploy.yml`)
- `NEON_API_KEY` (used by `preview-schema-diff.yml`)
- `NEON_PROJECT_ID` (used by `preview-schema-diff.yml`)
- `NEON_PROD_DATABASE_NAME` (optional override for schema diff DB; fallback is `neondb`)

### Vercel settings

Preview build command should be environment-aware so production builds do not run preview migration logic:

```bash
if [ "$VERCEL_ENV" = "preview" ]; then pnpm db:generate && pnpm db:migrate && next build --turbopack; else next build --turbopack; fi
```

Ignored Build Step should skip migration-sync commits:

```bash
if git log -1 --pretty=%B | grep -qF '[skip deploy]'; then exit 0; else exit 1; fi
```

Neon integration should be configured to use preview branch naming `preview/<git-branch>` and auto-clean obsolete branches.

---

## How to reason about failures quickly

### Preview did not deploy

- Check `vercel-preview-deploy.yml` preflight logs for `reason`
- Confirm `VERCEL_PREVIEW_DEPLOY_HOOK_URL` exists and is valid
- Confirm latest commit touched deploy-relevant paths

### Preview deployed but no schema diff comment

- Check if deployment environment name contains `Preview`
- Confirm `preview-schema-diff.yml` ran on `deployment_status`
- Confirm `NEON_API_KEY` and `NEON_PROJECT_ID` are set
- Confirm branch name resolves to `preview/<git-branch>` in Neon

### Migrations not synced to branch

- Check `preview-db-migrations.yml` run
- Confirm schema-related files changed
- Confirm workflow could push commit to PR branch

---

## Guardrails (do not bypass)

- Do not push directly to `develop` or `main`
- Do not force-push shared branches
- Do not skip CI checks to "unblock" deploys
- Do not run service-role DB client in request handlers

---

## Related docs

- `docs/context/ci/branching-strategy.md`
- `docs/rules/ci/development-workflow.md`
- `.github/workflows/ci-pr.yml`
- `.github/workflows/preview-db-migrations.yml`
- `.github/workflows/vercel-preview-deploy.yml`
- `.github/workflows/preview-schema-diff.yml`
- `.github/workflows/deploy-production-migrations.yml`
