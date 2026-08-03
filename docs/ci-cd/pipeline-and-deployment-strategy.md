# CI/CD Pipeline and Deployment Strategy

**Audience:** New engineers (especially junior hires)  
**Last Updated:** August 2026

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
- Dependency automation is defined on `main`, evaluates `develop`, and opens dependency PRs only against `develop`.

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
- Internal path filtering skips expensive jobs when no code changed, while the aggregate `All Checks Passed (PR)` check is still emitted for every PR.

### 2) `.github/workflows/ci-trunk.yml`

- Trigger: push to `develop` or `main` (plus merge queue)
- Runs: full integration and RLS security checks on trunk branches
- Browser smoke is a supported local command (`pnpm test:smoke`), not a hosted CI gate

### 3) `.github/dependabot.yml` and `.github/workflows/dependabot-auto-merge.yml`

- The configuration is read from the default branch, so it must be present on `main` before Dependabot or its weekly cadence is expected to run.
- Native version updates use the npm root, target `develop`, run weekly, and apply a seven-day cooldown. Patch and minor updates are grouped separately; major updates are not opened automatically.
- Native Dependabot security-update PRs are intentionally disabled. GitHub sends those PRs to default `main` regardless of `target-branch`; security remediation instead uses the custom workflow below so every automated dependency PR follows the `develop` integration path.
- Patch auto-merge only queues a squash merge for an exact Dependabot patch update to `develop` whose file list is `pnpm-lock.yaml` alone or exactly `package.json` plus `pnpm-lock.yaml`, with no policy changes. GitHub cannot complete the queued merge until all required checks are green; the workflow does not approve or bypass CI. Minor, major, security-remediation, and policy PRs require human review.

### 4) `.github/workflows/dependency-security-remediation.yml`

- The daily schedule and workflow definition must be on `main` because GitHub reads scheduled workflows from the default branch.
- `workflow_dispatch` is available for urgent advisories and validation. Each run checks out the exact current `develop` SHA, runs `pnpm audit --prod --audit-level=high`, and uses `pnpm audit --prod --audit-level=high --fix=update` when findings exist.
- A validated run updates one bot-owned branch/PR targeting `develop`; a clean audit is a no-op, and registry failures, residual findings, unexpected files, or ambiguous versions fail closed without mutating a PR.
- The workflow explicitly dispatches `ci-pr.yml` with `base_ref=develop` on the final bot-branch SHA and verifies `All Checks Passed (PR)` is attached to that exact SHA. This is required because a `GITHUB_TOKEN`-created PR does not reliably trigger an unattended PR workflow.
- The remediation lane may update `pnpm-lock.yaml` and exact release-age exclusions only; manifest, override, trust-policy, and build-policy changes use the manual remediation lane in the supply-chain policy.

### 5) `.github/workflows/staging-db-migrations.yaml`

- Trigger: manual dispatch from `develop`
- Purpose: apply the explicit safe expand set, then apply remaining contract migrations only after deploy health confirmation
- Behavior:
  - Skips any run whose ref is not `refs/heads/develop`
  - Checks out `develop`
  - Links the Supabase CLI to `STAGING_PROJECT_ID`
  - `expand` applies and records only the workflow's safe migration list
  - `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`

### 6) `.github/workflows/production-db-migrations.yaml`

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

### Urgent production hotfix

For a true emergency that cannot wait for the normal `develop` promotion, open the existing manual hotfix PR against `main` and keep the usual review, CI, and production deployment gates. Immediately merge that fix back to `develop` after the main merge. Do not turn this exceptional two-branch path into a routine dependency sync mechanism.

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

### Dependency remediation did not publish a PR

- Confirm the scheduled/manual workflow run is present on `main`; schedules on other branches are not authoritative.
- Check whether `develop` moved between planning and publication; the workflow intentionally stops and re-plans on the next run.
- For a residual high/critical or manifest-required advisory, follow the dedicated manual remediation-PR lane in [`docs/security/supply-chain-policy.md`](../security/supply-chain-policy.md).
- For a bot PR with missing checks, inspect the explicit `ci-pr.yml` dispatch and verify it ran against the latest bot-branch SHA with `base_ref=develop`.

---

## Guardrails (do not bypass)

- Do not push directly to `develop` or `main`
- Do not force-push shared branches
- Do not skip CI checks to "unblock" deploys
- Do not route routine dependency or security PRs to `main`; `main` is the default/release branch and `develop` is the integration target.
- Do not merge a fresh release-age exception without the required `@saldanaj97` code-owner approval.
- Do not run service-role DB client in request handlers
- Do not rely on CI to generate migrations for you; migration files must be committed with schema changes

---

## Related docs

- `docs/ci/branching-strategy.md`
- `.github/workflows/ci-pr.yml`
- `.github/workflows/ci-trunk.yml`
- `.github/workflows/staging-db-migrations.yaml`
- `.github/workflows/production-db-migrations.yaml`
