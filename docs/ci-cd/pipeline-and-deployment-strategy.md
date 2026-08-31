# CI/CD Pipeline and Deployment Strategy

**Audience:** New engineers (especially junior hires)  
**Last Updated:** August 2026

## Why this exists

This document explains how code moves from a feature branch to Preview, staging, and live Production.

The pipeline intentionally favors safety on production DB changes: expand migrations run before the Production app binary is exercised; contract migrations wait until after Production alias assignment and health verification.

---

## The short version

- Start work from `develop`.
- Open PRs into `develop` (or `main` only for true hotfixes).
- PRs run CircleCI `ci-pr` checks.
- Vercel's Git integration deploys branch pushes as Preview and `main` pushes as Production.
- Vercel's dashboard-configured Ignored Build Step skips builds for docs-only commits.
- Preview databases are provisioned per your Vercel/Supabase setup; wire `POSTGRES_URL` for each preview environment there.
- Merging to `develop` runs Supabase CLI migrations against staging (operator-dispatched expand/contract).
- JCS-52 will add native Vercel Deployment Checks for Production gating.
- No Vercel credentials are stored in GitHub; Vercel project and Production configuration remain in Vercel.
- Dependency automation is defined on `main`, evaluates `develop`, and opens dependency PRs only against `develop`.

---

## Environments and ownership

| Environment | Source | Owner | Notes |
| ----------- | ------ | ----- | ----- |
| Local / Local Preview | Your feature branch | You | Fast local iteration (`pnpm dev`, local product testing; 1Password Local Preview lane in JCS-50) |
| Preview | Branch pushes and PRs | Vercel Git integration | Each branch push gets a Preview deployment unless the Ignored Build Step skips a docs-only commit |
| Staging | `develop` | Vercel Preview + Supabase migrations | The `develop` Preview uses non-Production services; migration phases target the staging project |
| Staged Production proof | Exact `main` SHA on `origin/main` | Operator + Vercel | Post-push unaliased rehearsal; it does not govern native Production aliases or domains. Not a sandbox — uses Production-scoped config. See [staged-production-deployment.md](./staged-production-deployment.md). |
| Live Production | `main` | Vercel Git integration | `main` pushes create Production deployments; JCS-52 will add native Deployment Checks for Production gating |

---

## Workflow map (what each workflow does)

### 1) CircleCI dynamic setup (`.circleci/config.yml`)

- The setup pipeline uses `circleci/path-filtering@1.3.0` to compare the current revision with the PR base branch or `pipeline.git.base_revision` for `main`/`develop` pushes. Standalone feature-branch pushes do not launch a setup workflow; PR events own validation.
- Every changed-file pipeline includes `.circleci/shared-config.yml`. Docs-only changes—including root Markdown files—add `.circleci/docs-config.yml`; code, mixed, and CI/config changes add `.circleci/code-config.yml`. The orb merges the selected fragments into the single continuation config.
- `.circleci/no-updates.yml` is the fallback when the comparison contains no changed files.
- Docs-only pipelines publish zero-credit no-op jobs under the seven required check names. They do not provision code CI executors or run lint, build, audit, or test commands.

### 2) CircleCI `ci-pr` (`.circleci/code-config.yml`)

- Trigger: GitHub App `pull_request` events (`opened` / `synchronize` / `reopened` / `ready_for_review`) whose head is not `main`. That includes ordinary feature/hotfix PRs into `develop` and `develop` → `main` promotion PRs.
- Draft PRs do not run `ci-pr`; the gate starts when the PR is marked ready for review and reruns on later updates.
- Runs: lint, type-check, dependency audit, build, unit tests, PR integration tests (related for small source diffs, full for global or broad diffs, light only when no suitable source candidates), RLS security tests, and production workflow tests
- `.circleci/test-suites.yml` defines the unit-test discovery/run contract for CircleCI Smarter Testing, including test impact analysis and dynamic splitting. PR `unit-tests` runs `circleci testsuite run`; JUnit output is stored at `test-results/unit/junit.xml` for timing and result ingestion.
- `detect-changes` still selects related versus full integration coverage inside code pipelines. There is no aggregator job; GitHub rulesets must require the individual CircleCI job names: `lint-and-type-check`, `vulnerability-scan`, `build`, `unit-tests`, `integration-light`, `security-tests`, `workflow-tests` (GitHub may show them as `ci/circleci: <job>` — pick the names from **Add checks** after a pipeline has run)
- `develop` → `main` PRs need a CircleCI GitHub App trigger that emits `pull_request` (`opened` / `synchronize` / `reopened` / `ready_for_review`). Keep **All pushes** so `ci-trunk` still runs on `develop` and `main`

### 3) CircleCI `ci-trunk` (`.circleci/code-config.yml`)

- Trigger: **All pushes** that are not `pull_request` events, with jobs filtered to `develop` and `main`. Keep the CircleCI GitHub App **All pushes** trigger so this workflow still starts on trunk.
- Runs: full integration tests (`integration-tests`) and RLS security tests (`security-tests`) after merge
- There is no CircleCI `merge_group` trigger. Do not treat merge-queue SHAs as gated here.
- Codecov upload is still absent. There is no `All Checks Passed (trunk)` aggregator; workflow status is the gate.
- Integration/security jobs use a CircleCI Postgres sidecar (`SKIP_TESTCONTAINERS=true`), not Testcontainers
- `detect-changes` can skip those jobs when no integration-path files changed; the workflow still starts
- On `develop`, `unit-impact-analysis` refreshes the Smarter Testing impact map with `--analyze-tests=impacted --run-tests=none`; PR runs then use that map for impacted-test selection and dynamic splitting.
- Browser smoke is a supported local command (`pnpm test:smoke`), not a hosted CI gate

Vercel's native Git integration is separate from CircleCI: every branch push creates a Preview deployment (including `develop`), and every `main` push creates a Production deployment. JCS-52 will add the native Deployment Checks needed to gate Production release decisions.

### 4) `.github/dependabot.yml` and `.github/workflows/dependabot-auto-merge.yml`

- The configuration is read from the default branch, so it must be present on `main` before Dependabot or its weekly cadence is expected to run.
- Native version updates use the npm root, target `develop`, run weekly, and apply a seven-day cooldown. Patch and minor updates are grouped separately; major updates are not opened automatically.
- Native Dependabot security-update PRs are intentionally disabled. GitHub sends those PRs to default `main` regardless of `target-branch`; security remediation instead uses the custom workflow below so every automated dependency PR follows the `develop` integration path.
- Patch auto-merge only queues a squash merge for an exact Dependabot patch update to `develop` whose file list is `pnpm-lock.yaml` alone or exactly `package.json` plus `pnpm-lock.yaml`, with no policy changes. GitHub cannot complete the queued merge until all required checks are green; the workflow does not approve or bypass CI. Minor, major, security-remediation, and policy PRs require human review.

### 5) `.github/workflows/dependency-security-remediation.yml`

- The daily schedule and workflow definition must be on `main` because GitHub reads scheduled workflows from the default branch.
- `workflow_dispatch` is available for urgent advisories and validation. Each run checks out the exact current `develop` SHA, runs `pnpm audit --prod --audit-level=high`, and uses `pnpm audit --prod --audit-level=high --fix=update` when findings exist.
- A validated run updates one bot-owned branch/PR targeting `develop`; a clean audit is a no-op, and registry failures, residual findings, unexpected files, or ambiguous versions fail closed without mutating a PR.
- The workflow does not dispatch GitHub Actions PR CI. CircleCI `ci-pr` runs from the bot PR's `opened` or `synchronize` event (GitHub App). The job polls until required status checks are registered, then waits for them on the final bot SHA (`gh pr checks --required --watch`).
- The remediation lane may update `pnpm-lock.yaml` and exact release-age exclusions only; manifest, override, trust-policy, and build-policy changes use the manual remediation lane in the supply-chain policy.

### 6) `.github/workflows/staging-db-migrations.yaml`

- Trigger: manual dispatch from `develop`
- Purpose: apply exhaustive expand/contract manifests from `scripts/db/run-phased-migrations.sh`, with contract only after deploy health confirmation
- Behavior:
  - `validate-dispatch` has no environment and fails (does not skip) when the ref is not `refs/heads/develop`
  - `deploy` needs that job, owns the `staging` environment, and checks out the dispatch SHA (`${{ github.sha }}`)
  - Links the Supabase CLI to `STAGING_PROJECT_ID`
  - Each phase builds a temporary workspace of applied history plus only that phase's pending files, then runs `supabase migration up --linked --include-all --yes --workdir`
  - `expand` applies only pending `EXPAND_MIGRATIONS`
  - `contract` requires `post-deploy-health-verified`, applies only pending `CONTRACT_MIGRATIONS`, and fails if any expand migration is still pending
  - After each successful phase, `scripts/db/run-phased-migrations.sh` runs read-only privilege attestation for that phase (`bash scripts/db/attest-effective-privileges.sh <expand|contract>`). Failures block the workflow. Details: [client-usage.md](../database/client-usage.md#privilege-model-and-attestation) and [deploy.md](../development/deploy.md).

### 7) `.github/workflows/production-db-migrations.yaml`

- Trigger: manual dispatch from `main`
- Purpose: apply exhaustive expand/contract manifests from `scripts/db/run-phased-migrations.sh`, with contract only after deploy health confirmation
- Behavior:
  - `validate-dispatch` has no environment and fails (does not skip) when the ref is not `refs/heads/main`
  - `deploy` needs that job, owns the `Production – atlaris` environment, and checks out the dispatch SHA (`${{ github.sha }}`)
  - Links the Supabase CLI to `PRODUCTION_PROJECT_ID`
  - Each phase builds a temporary workspace of applied history plus only that phase's pending files, then runs `supabase migration up --linked --include-all --yes --workdir`
  - `expand` applies only pending `EXPAND_MIGRATIONS`
  - `contract` requires `post-deploy-health-verified`, applies only pending `CONTRACT_MIGRATIONS`, and fails if any expand migration is still pending
  - Same post-phase privilege attestation as staging (phase-scoped script + fail-closed).

---

## End-to-end flow: PR lifecycle

1. You push to a feature branch and open a PR to `develop`.
2. CircleCI `ci-pr` validates code quality and tests.
3. Vercel's Git integration creates a Preview deployment for the branch push or PR; the Ignored Build Step skips docs-only commits.
4. Configure preview Supabase settings in Vercel if preview deployments need a database.

---

## End-to-end flow: trunk and production

### Merge to `develop`

- Runs CircleCI `ci-trunk` (`integration-tests` + `security-tests`)
- Vercel's Git integration creates the `develop` Preview, which is the hosted staging surface; use non-Production services and the operator-dispatched migration phases as needed
- After deployment health verification, the operator dispatches phase `contract` when needed

### Merge to `main`

- Runs CircleCI `ci-trunk` (`integration-tests` + `security-tests`; those jobs skip when `detect-changes` finds no integration-path files)
- Requires an operator to run `production-db-migrations.yaml` phase `expand` before exercising a Production-targeted binary that needs new schema
- Vercel's Git integration creates the Production deployment for the `main` push; before JCS-52 is available, use the post-push unaliased rehearsal from a clean `main` checkout after that exact SHA exists on `origin/main`. The rehearsal does not govern native Production alias/domain assignment ([staged-production-deployment.md](./staged-production-deployment.md))
- JCS-52 will add native Vercel Deployment Checks enforced by Deployment Protection; only that combination can gate live alias assignment. After the Production deployment and health verification, dispatch phase `contract` when needed

### Urgent production hotfix

For a true emergency that cannot wait for the normal `develop` promotion, open the existing manual hotfix PR against `main` and keep the usual review, CI, and staged Production release gates. Immediately merge that fix back to `develop` after the main merge. Do not turn this exceptional two-branch path into a routine dependency sync mechanism.

---

## Required platform configuration (outside this repo)

### GitHub environment gates

Create protected GitHub environments named `staging` and `Production – atlaris` for migration and worker workflows. Vercel Deployment Protection and native Deployment Checks, not a GitHub environment, gate live Production alias assignment.

| Environment            | Deployment branch rule | Required reviewers |
| ---------------------- | ---------------------- | ------------------ |
| `staging`              | `develop`              | Yes                |
| `Production – atlaris` | `main`                 | Yes                |

Store the Supabase migration and worker secrets below as environment secrets on the matching environment, not as broad repository secrets.

### GitHub environment secrets

- `SUPABASE_ACCESS_TOKEN` (set separately on `staging` and `Production – atlaris`)
- `STAGING_PROJECT_ID` (set on `staging`)
- `STAGING_DB_PASSWORD` (set on `staging`)
- `PRODUCTION_PROJECT_ID` (set on `Production – atlaris`)
- `PRODUCTION_DB_PASSWORD` (set on `Production – atlaris`)

No Vercel credentials are stored in GitHub. Vercel project and Production environment configuration remain in Vercel.

### Vercel settings

Keep the GitHub project connection and Deployment Protection enabled. Configure the Ignored Build Step in the Vercel dashboard to skip commits limited to documentation files; any code or mixed change should build. Native Git remains enabled for all branches, with branch pushes creating Preview deployments and `main` pushes creating Production deployments. JCS-52 will add native Deployment Checks for Production gating.

---

## How to reason about failures quickly

### Supabase migration workflow fails

- Confirm the workflow is using the intended project secret (`STAGING_PROJECT_ID` for `develop`, `PRODUCTION_PROJECT_ID` for `main`).
- Confirm `SUPABASE_ACCESS_TOKEN` and the matching database password secret are set.
- Confirm the selected branch is `develop` for staging or `main` for production. Other refs fail `validate-dispatch` before deploy starts.
- For `contract`, confirm rollout health and the Stripe archive counts before entering `post-deploy-health-verified`. Contract also fails if any expand migration is still pending.
- Inspect the `supabase migration up` logs for the failing migration file.

### Production deploy blocked

- Confirm staged Production preflight (clean `main` SHA, Staging acceptance, expand migrations) in [staged-production-deployment.md](./staged-production-deployment.md)
- Check `production-db-migrations.yaml` if schema expand/contract is part of the release
- If migrations ran, inspect the `supabase migration up` logs
- For native Vercel deployment issues, inspect the Vercel dashboard deployment and Ignored Build Step result

### Dependency remediation did not publish a PR

- Confirm the scheduled/manual workflow run is present on `main`; schedules on other branches are not authoritative.
- Check whether `develop` moved between planning and publication; the workflow intentionally stops and re-plans on the next run.
- For a residual high/critical or manifest-required advisory, follow the dedicated manual remediation-PR lane in [`docs/security/supply-chain-policy.md`](../security/supply-chain-policy.md).
- For a bot PR with missing checks, confirm CircleCI `ci-pr` ran on the bot PR's `opened` or `synchronize` event and that the development ruleset required jobs are present on that SHA.

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
- `.circleci/code-config.yml`
- `.circleci/shared-config.yml`
- `.circleci/docs-config.yml`
- `.circleci/no-updates.yml`
- `.circleci/test-suites.yml`
- `.github/workflows/staging-db-migrations.yaml`
- `.github/workflows/production-db-migrations.yaml`
