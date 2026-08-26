# CI/CD Pipeline and Deployment Strategy

**Audience:** New engineers (especially junior hires)  
**Last Updated:** August 2026

## Why this exists

This document explains how code moves from a feature branch to preview, staging, staged Production, and live Production.

The pipeline intentionally favors safety on production DB changes: expand migrations run before the Production app binary is exercised; contract migrations wait until after promote and health verification.

---

## The short version

- Start work from `develop`.
- Open PRs into `develop` (or `main` only for true hotfixes).
- PRs run CircleCI `ci-pr` checks.
- Vercel handles preview deployments natively for non-`main` branches.
- Preview databases are provisioned per your Vercel/Supabase setup; wire `POSTGRES_URL` for each preview environment there.
- Merging to `develop` runs Supabase CLI migrations against staging (operator-dispatched expand/contract).
- Merging to `main` enables Production migration workflows; the Production **app** release uses a guarded staged Production lane (`vercel --prod --skip-domain`), then explicit `vercel promote` after verification.
- Dependency automation is defined on `main`, evaluates `develop`, and opens dependency PRs only against `develop`.

---

## Environments and ownership

| Environment | Source | Owner | Notes |
| ----------- | ------ | ----- | ----- |
| Local / Local Preview | Your feature branch | You | Fast local iteration (`pnpm dev`, local product testing; 1Password Local Preview lane in JCS-50) |
| Preview | PR branch | Vercel (+ hosted Postgres) | Auto preview deploy via Vercel git integration |
| Staging | `develop` | GitHub Actions + Vercel | Hosted non-Production services; Supabase migrations target the staging project |
| Staged Production | Exact `main` SHA | Operator + Vercel CLI | Production-targeted build **without** assigning public domains (`--skip-domain`). Not a sandbox — uses Production-scoped config. See [staged-production-deployment.md](./staged-production-deployment.md). |
| Live Production | Promoted staged deployment | Operator + Vercel | Same verified artifact after `vercel promote`; public Production domains move |

---

## Workflow map (what each workflow does)

### 1) CircleCI `ci-pr` (`.circleci/config.yml`)

- Trigger: pushes to feature/`fix`/`ci`/… branches, plus GitHub App `pull_request` events (`opened` / `synchronize` / `reopened` / `ready_for_review`) whose head is not `main`. That includes ordinary feature/hotfix PRs into `develop` and `develop` → `main` promotion PRs. Feature-branch PR events must run `ci-pr` because auto-cancel of the in-flight push pipeline would otherwise leave an empty run.
- Runs: lint, type-check, dependency audit, build, unit tests, PR integration tests (related for small source diffs, full for global or broad diffs, light only when no suitable source candidates), RLS security tests, and production workflow tests
- Path filtering skips expensive jobs when no code changed. There is no aggregator job; GitHub rulesets must require the individual CircleCI job names: `lint-and-type-check`, `vulnerability-scan`, `build`, `unit-tests`, `integration-light`, `security-tests`, `workflow-tests` (GitHub may show them as `ci/circleci: <job>` — pick the names from **Add checks** after a pipeline has run)
- `develop` → `main` PRs need a CircleCI GitHub App trigger that emits `pull_request` (`opened` / `synchronize` / `reopened` / `ready_for_review`). Keep **All pushes** so `ci-trunk` still runs on `develop` and `main`

### 2) CircleCI `ci-trunk` (`.circleci/config.yml`)

- Trigger: **All pushes** that are not `pull_request` events, with jobs filtered to `develop` and `main`. Keep the CircleCI GitHub App **All pushes** trigger so this workflow still starts on trunk.
- Runs: full integration tests (`integration-tests`) and RLS security tests (`security-tests`) after merge
- There is no CircleCI `merge_group` trigger. Do not treat merge-queue SHAs as gated here.
- Codecov upload is still absent. There is no `All Checks Passed (trunk)` aggregator; workflow status is the gate.
- Integration/security jobs use a CircleCI Postgres sidecar (`SKIP_TESTCONTAINERS=true`), not Testcontainers
- `detect-changes` can skip those jobs when no integration-path files changed; the workflow still starts
- Browser smoke is a supported local command (`pnpm test:smoke`), not a hosted CI gate
- Because there is no uniquely named post-merge check wired into Vercel, v1 staged Production promotion is **manual-only** and does not require a Vercel Deployment Check yet (see [staged-production-deployment.md](./staged-production-deployment.md))

### 3) `.github/dependabot.yml` and `.github/workflows/dependabot-auto-merge.yml`

- The configuration is read from the default branch, so it must be present on `main` before Dependabot or its weekly cadence is expected to run.
- Native version updates use the npm root, target `develop`, run weekly, and apply a seven-day cooldown. Patch and minor updates are grouped separately; major updates are not opened automatically.
- Native Dependabot security-update PRs are intentionally disabled. GitHub sends those PRs to default `main` regardless of `target-branch`; security remediation instead uses the custom workflow below so every automated dependency PR follows the `develop` integration path.
- Patch auto-merge only queues a squash merge for an exact Dependabot patch update to `develop` whose file list is `pnpm-lock.yaml` alone or exactly `package.json` plus `pnpm-lock.yaml`, with no policy changes. GitHub cannot complete the queued merge until all required checks are green; the workflow does not approve or bypass CI. Minor, major, security-remediation, and policy PRs require human review.

### 4) `.github/workflows/dependency-security-remediation.yml`

- The daily schedule and workflow definition must be on `main` because GitHub reads scheduled workflows from the default branch.
- `workflow_dispatch` is available for urgent advisories and validation. Each run checks out the exact current `develop` SHA, runs `pnpm audit --prod --audit-level=high`, and uses `pnpm audit --prod --audit-level=high --fix=update` when findings exist.
- A validated run updates one bot-owned branch/PR targeting `develop`; a clean audit is a no-op, and registry failures, residual findings, unexpected files, or ambiguous versions fail closed without mutating a PR.
- The workflow does not dispatch GitHub Actions PR CI. CircleCI `ci-pr` runs from the bot-branch `push` (GitHub App). The job polls until required status checks are registered, then waits for them on the final bot SHA (`gh pr checks --required --watch`).
- The remediation lane may update `pnpm-lock.yaml` and exact release-age exclusions only; manifest, override, trust-policy, and build-policy changes use the manual remediation lane in the supply-chain policy.

### 5) `.github/workflows/staging-db-migrations.yaml`

- Trigger: manual dispatch from `develop`
- Purpose: apply the explicit safe expand set, then apply remaining contract migrations only after deploy health confirmation
- Behavior:
  - Skips any run whose ref is not `refs/heads/develop`
  - Checks out `develop`
  - Links the Supabase CLI to `STAGING_PROJECT_ID`
  - `expand` applies and records only the workflow's safe migration list atomically through the Supabase migration runner
  - `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`
  - After each successful phase, `scripts/db/run-phased-migrations.sh` runs read-only privilege attestation for that phase (`bash scripts/db/attest-effective-privileges.sh <expand|contract>`). Failures block the workflow. Details: [client-usage.md](../database/client-usage.md#privilege-model-and-attestation) and [deploy.md](../development/deploy.md).

### 6) `.github/workflows/production-db-migrations.yaml`

- Trigger: manual dispatch from `main`
- Purpose: apply the explicit safe expand set, then apply remaining contract migrations only after deploy health confirmation
- Behavior:
  - Skips any run whose ref is not `refs/heads/main`
  - Checks out `main`
  - Links the Supabase CLI to `PRODUCTION_PROJECT_ID`
  - `expand` applies and records only the workflow's safe migration list atomically through the Supabase migration runner
  - `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`
  - Same post-phase privilege attestation as staging (phase-scoped script + fail-closed).

---

## End-to-end flow: PR lifecycle

1. You push to a feature branch and open a PR to `develop`.
2. CircleCI `ci-pr` validates code quality and tests.
3. Vercel creates/updates a preview deployment automatically.
4. Configure preview Supabase settings in Vercel if preview deployments need a database.

---

## End-to-end flow: trunk and production

### Merge to `develop`

- Runs CircleCI `ci-trunk` (`integration-tests` + `security-tests`)
- Requires an operator to run `staging-db-migrations.yaml` phase `expand` before deployment and phase `contract` after health verification
- Vercel deploys staging

### Merge to `main`

- Runs CircleCI `ci-trunk` (`integration-tests` + `security-tests`; those jobs skip when `detect-changes` finds no integration-path files)
- Requires an operator to run `production-db-migrations.yaml` phase `expand` before exercising a Production-targeted binary that needs new schema
- Production app release uses the staged Production lane:
  1. Preflight on the exact clean `main` SHA ([staged-production-deployment.md](./staged-production-deployment.md))
  2. `vercel --prod --skip-domain` (does not move public Production domains)
  3. Narrow smoke on the protected generated URL
  4. Explicit human `vercel promote <deployment-id-or-url>` of that same artifact
  5. Alias verification, observation, drain, then `contract` migrations if needed

### Urgent production hotfix

For a true emergency that cannot wait for the normal `develop` promotion, open the existing manual hotfix PR against `main` and keep the usual review, CI, and staged Production promotion gates. Immediately merge that fix back to `develop` after the main merge. Do not turn this exceptional two-branch path into a routine dependency sync mechanism.

---

## Required platform configuration (outside this repo)

### GitHub environment gates

Create protected GitHub environments named `staging` and `Production – atlaris`.

| Environment            | Deployment branch rule | Required reviewers |
| ---------------------- | ---------------------- | ------------------ |
| `staging`              | `develop`              | Yes                |
| `Production – atlaris` | `main`                 | Yes                |

Store the Supabase migration secrets below as environment secrets on the matching environment, not as broad repository secrets.

### GitHub environment secrets

- `SUPABASE_ACCESS_TOKEN` (set separately on `staging` and `Production – atlaris`)
- `STAGING_PROJECT_ID` (set on `staging`)
- `STAGING_DB_PASSWORD` (set on `staging`)
- `PRODUCTION_PROJECT_ID` (set on `Production – atlaris`)
- `PRODUCTION_DB_PASSWORD` (set on `Production – atlaris`)

### GitHub repository secrets

Optional Vercel CLI / automation credentials when an operator or future workflow authenticates non-interactively:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

There is no GitHub Actions workflow in this repository that automatically deploys or promotes Production. Production app release is the operator-driven staged Production lane in [staged-production-deployment.md](./staged-production-deployment.md).

### Vercel settings

Set preview deployment behavior so non-`main` branches get preview deployments.

Prefer the staged Production CLI path (`--skip-domain` then explicit promote) over unattended auto-production domain assignment on every `main` push. If Git integration would race with a staged promote, disable automatic Production domain assignment for git pushes and keep promotion operator-owned.

---

## How to reason about failures quickly

### Supabase migration workflow fails

- Confirm the workflow is using the intended project secret (`STAGING_PROJECT_ID` for `develop`, `PRODUCTION_PROJECT_ID` for `main`).
- Confirm `SUPABASE_ACCESS_TOKEN` and the matching database password secret are set.
- Confirm the selected branch is `develop` for staging or `main` for production. Other refs are skipped before checkout.
- For `contract`, confirm rollout health and the Stripe archive counts before entering `post-deploy-health-verified`.
- Inspect the Supabase migration runner logs for the failing migration file.

### Production deploy blocked

- Confirm staged Production preflight (clean `main` SHA, Staging acceptance, expand migrations) in [staged-production-deployment.md](./staged-production-deployment.md)
- Check `production-db-migrations.yaml` if schema expand/contract is part of the release
- If migrations ran, inspect the `supabase db push` logs
- For CLI auth issues, verify local `vercel` login / link or optional `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`

### Dependency remediation did not publish a PR

- Confirm the scheduled/manual workflow run is present on `main`; schedules on other branches are not authoritative.
- Check whether `develop` moved between planning and publication; the workflow intentionally stops and re-plans on the next run.
- For a residual high/critical or manifest-required advisory, follow the dedicated manual remediation-PR lane in [`docs/security/supply-chain-policy.md`](../security/supply-chain-policy.md).
- For a bot PR with missing checks, confirm CircleCI `ci-pr` ran on the bot branch push and that the development ruleset required jobs are present on that SHA.

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

- `docs/ci-cd/staged-production-deployment.md`
- `docs/ci/branching-strategy.md`
- `docs/development/deploy.md`
- `.circleci/config.yml`
- `.github/workflows/staging-db-migrations.yaml`
- `.github/workflows/production-db-migrations.yaml`
