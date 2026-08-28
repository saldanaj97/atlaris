# CI/CD Pipeline and Deployment Strategy

**Audience:** New engineers (especially junior hires)  
**Last Updated:** August 2026

## Why this exists

This document explains how code moves from a feature branch to preview, staging, staged Production, and live Production.

The pipeline intentionally favors safety on production DB changes: expand migrations run before the Production app binary is exercised; contract migrations wait until after alias assignment and health verification.

---

## The short version

- Start work from `develop`.
- Open PRs into `develop` (or `main` only for true hotfixes).
- PRs run CircleCI `ci-pr` checks.
- `.github/workflows/vercel-deploy.yml` classifies every in-scope change before calling Vercel; docs-only changes create no deployment.
- Preview databases are provisioned per your Vercel/Supabase setup; wire `POSTGRES_URL` for each preview environment there.
- Merging to `develop` runs Supabase CLI migrations against staging (operator-dispatched expand/contract).
- After cutover, merging deploy-impacting changes to `main` creates a Production deployment whose domains remain blocked until JCS-52 approval and exact-candidate smoke pass; routine `vercel promote` is not the release path.
- Dependency automation is defined on `main`, evaluates `develop`, and opens dependency PRs only against `develop`.

---

## Environments and ownership

| Environment | Source | Owner | Notes |
| ----------- | ------ | ----- | ----- |
| Local / Local Preview | Your feature branch | You | Fast local iteration (`pnpm dev`, local product testing; 1Password Local Preview lane in JCS-50) |
| Preview | PR branch | GitHub Actions + Vercel | Same-repository, deploy-impacting PRs only; forks never receive deployment secrets |
| Staging | `develop` | GitHub Actions + Vercel Preview | Hobby-plan fallback: Preview variables scoped to `develop`; Supabase migrations target staging |
| Staged Production proof | Exact `main` SHA | Operator + Vercel | Pre-cutover `--skip-domain` proof without assigning public domains. Not a sandbox — uses Production-scoped config. See [staged-production-deployment.md](./staged-production-deployment.md). |
| Live Production | Approved staged deployment | Vercel + JCS-52 release gate | The exact candidate is aliased automatically only after approval and exact-candidate smoke |

---

## Workflow map (what each workflow does)

### 1) CircleCI dynamic setup (`.circleci/config.yml`)

- The setup pipeline uses `circleci/path-filtering@1.3.0` to compare the current revision with the PR base branch or `pipeline.git.base_revision` for `main`/`develop` pushes. Standalone feature-branch pushes do not launch a setup workflow; PR events own validation.
- Every changed-file pipeline includes `.circleci/shared-config.yml`. Docs-only changes add `.circleci/docs-config.yml`; code, mixed, root, and CI/config changes add `.circleci/code-config.yml`. The orb merges the selected fragments into the single continuation config.
- `.circleci/no-updates.yml` is the fallback when the comparison contains no changed files.
- Docs-only pipelines publish zero-credit no-op jobs under the seven required check names. They do not provision code CI executors or run lint, build, audit, or test commands.

### 2) CircleCI `ci-pr` (`.circleci/code-config.yml`)

- Trigger: GitHub App `pull_request` events (`opened` / `synchronize` / `reopened` / `ready_for_review`) whose head is not `main`. That includes ordinary feature/hotfix PRs into `develop` and `develop` → `main` promotion PRs.
- Runs: lint, type-check, dependency audit, build, unit tests, PR integration tests (related for small source diffs, full for global or broad diffs, light only when no suitable source candidates), RLS security tests, production workflow tests, and GitHub workflow-script tests
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
- CircleCI remains the code-quality gate. It is not the Production Deployment Check because it does not validate the generated deployment URL.

### 4) `.github/workflows/vercel-deploy.yml`

- Runs broadly for PRs and pushes to `develop`/`main`, plus manual Preview/Staging proof dispatches. It has no workflow-level path filter.
- `deployment-decision` always reports `docs-only`, `deploy-impacting path`, `unknown diff`, or `forced`. Unknown or malformed comparisons fail open to deployment.
- Decision jobs run independently; only the Preview, Staging, and Production deployment jobs serialize within their own lanes. A later docs-only run therefore cannot replace a pending deploy-impacting job.
- Same-repository deploy-impacting PRs create Preview deployments; forks and Dependabot PRs never receive Vercel secrets.
- A known deploy-impacting `develop` push uses the Hobby-plan Staging fallback only after the exact SHA's CircleCI `ci-trunk` succeeds and the full unreleased `main...develop` range contains no migration files. While that range contains a migration, or when the diff is unknown, run `expand` for current `develop`; the manual Staging dispatch verifies that exact SHA's successful expand run before deployment.
- After cutover, deploy-impacting `main` pushes create a Production deployment only after the exact SHA's CircleCI `ci-trunk` workflow succeeds. A push containing `supabase/migrations/` also requires a successful exact-SHA Production `expand` run. Required JCS-52 Deployment Checks then block domain assignment until approval and exact-candidate smoke pass; the job never promotes, aliases, or rolls back.
- The Production job fails closed unless both `VERCEL_NATIVE_GIT_DISABLED` and `VERCEL_DEPLOYMENT_CHECKS_READY` are exactly `true`.

### 5) `.github/dependabot.yml` and `.github/workflows/dependabot-auto-merge.yml`

- The configuration is read from the default branch, so it must be present on `main` before Dependabot or its weekly cadence is expected to run.
- Native version updates use the npm root, target `develop`, run weekly, and apply a seven-day cooldown. Patch and minor updates are grouped separately; major updates are not opened automatically.
- Native Dependabot security-update PRs are intentionally disabled. GitHub sends those PRs to default `main` regardless of `target-branch`; security remediation instead uses the custom workflow below so every automated dependency PR follows the `develop` integration path.
- Patch auto-merge only queues a squash merge for an exact Dependabot patch update to `develop` whose file list is `pnpm-lock.yaml` alone or exactly `package.json` plus `pnpm-lock.yaml`, with no policy changes. GitHub cannot complete the queued merge until all required checks are green; the workflow does not approve or bypass CI. Minor, major, security-remediation, and policy PRs require human review.

### 6) `.github/workflows/dependency-security-remediation.yml`

- The daily schedule and workflow definition must be on `main` because GitHub reads scheduled workflows from the default branch.
- `workflow_dispatch` is available for urgent advisories and validation. Each run checks out the exact current `develop` SHA, runs `pnpm audit --prod --audit-level=high`, and uses `pnpm audit --prod --audit-level=high --fix=update` when findings exist.
- A validated run updates one bot-owned branch/PR targeting `develop`; a clean audit is a no-op, and registry failures, residual findings, unexpected files, or ambiguous versions fail closed without mutating a PR.
- The workflow does not dispatch GitHub Actions PR CI. CircleCI `ci-pr` runs from the bot PR's `opened` or `synchronize` event (GitHub App). The job polls until required status checks are registered, then waits for them on the final bot SHA (`gh pr checks --required --watch`).
- The remediation lane may update `pnpm-lock.yaml` and exact release-age exclusions only; manifest, override, trust-policy, and build-policy changes use the manual remediation lane in the supply-chain policy.

### 7) `.github/workflows/staging-db-migrations.yaml`

- Trigger: manual dispatch from `develop`
- Purpose: apply the explicit safe expand set, then apply remaining contract migrations only after deploy health confirmation
- Behavior:
  - Skips any run whose ref is not `refs/heads/develop`
  - Checks out `develop`
  - Links the Supabase CLI to `STAGING_PROJECT_ID`
  - `expand` applies and records only the workflow's safe migration list atomically through the Supabase migration runner
  - `contract` requires `post-deploy-health-verified`, then runs `supabase db push --include-all`
  - After each successful phase, `scripts/db/run-phased-migrations.sh` runs read-only privilege attestation for that phase (`bash scripts/db/attest-effective-privileges.sh <expand|contract>`). Failures block the workflow. Details: [client-usage.md](../database/client-usage.md#privilege-model-and-attestation) and [deploy.md](../development/deploy.md).

### 8) `.github/workflows/production-db-migrations.yaml`

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
3. The deployment workflow reports its decision; a same-repository deploy-impacting PR creates a custom-CI Preview deployment.
4. Configure preview Supabase settings in Vercel if preview deployments need a database.

---

## End-to-end flow: trunk and production

### Merge to `develop`

- Runs CircleCI `ci-trunk` (`integration-tests` + `security-tests`)
- After the exact SHA's CircleCI `ci-trunk` succeeds, known deploy-impacting changes create the `develop` Preview fallback only when the full unreleased range from `main` contains no migration files
- While the unreleased range contains a migration, or when the diff is unknown, an operator runs `staging-db-migrations.yaml` phase `expand` and then manually dispatches Staging for current `develop`; the lane verifies the same-SHA expand run, and phase `contract` follows health verification

### Merge to `main`

- Runs CircleCI `ci-trunk` (`integration-tests` + `security-tests`; those jobs skip when `detect-changes` finds no integration-path files)
- Requires an operator to run `production-db-migrations.yaml` phase `expand` before exercising a Production-targeted binary that needs new schema
- Production app release uses the staged Production lane:
  1. Preflight on the exact clean `main` SHA ([staged-production-deployment.md](./staged-production-deployment.md))
  2. Vercel remotely builds and deploys the exact committed `main` SHA only after native Git is disabled and JCS-52 Deployment Checks are ready; Production variables remain in Vercel
  3. Required checks hold back Production domains while JCS-52 obtains human approval and runs narrow exact-candidate smoke on the generated URL
  4. Passing checks let Vercel alias that same artifact automatically
  5. Alias verification, observation, drain, then `contract` migrations if needed

### Urgent production hotfix

For a true emergency that cannot wait for the normal `develop` promotion, open the existing manual hotfix PR against `main` and keep the usual review, CI, and staged Production release gates. Immediately merge that fix back to `develop` after the main merge. Do not turn this exceptional two-branch path into a routine dependency sync mechanism.

---

## Required platform configuration (outside this repo)

### GitHub environment gates

Create protected GitHub environments named `staging` and `Production – atlaris`.

| Environment            | Deployment branch rule | Required reviewers |
| ---------------------- | ---------------------- | ------------------ |
| `staging`              | `develop`              | No                 |
| `Production – atlaris` | `main`                 | Yes                |

Store the Supabase migration secrets below as environment secrets on the matching environment, not as broad repository secrets.

### GitHub environment secrets

- `SUPABASE_ACCESS_TOKEN` (set separately on `staging` and `Production – atlaris`)
- `STAGING_PROJECT_ID` (set on `staging`)
- `STAGING_DB_PASSWORD` (set on `staging`)
- `PRODUCTION_PROJECT_ID` (set on `Production – atlaris`)
- `PRODUCTION_DB_PASSWORD` (set on `Production – atlaris`)

### GitHub repository secrets

Vercel custom-CI credentials used by the deployment workflow:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

These credentials link custom CI to the Vercel project; Production application variables stay in Vercel and are never copied into GitHub.

### GitHub repository variables

- `VERCEL_NATIVE_GIT_DISABLED`: leave unset during proof. Set to `true` only after the custom lanes are proven, native Git deployment creation is disabled in Vercel, and Juan approves cutover. The Production-candidate job remains skipped otherwise.
- `VERCEL_DEPLOYMENT_CHECKS_READY`: leave unset until JCS-52's required Deployment Checks are configured and proven. The Production-candidate job remains skipped otherwise.

### Vercel settings

Keep the GitHub project connection, automatic Production-domain assignment, and Deployment Protection enabled. During proof, native Git deployment creation remains enabled and may create duplicate Preview deployments. Prove an unaliased candidate from an exact trusted `main` checkout with `--skip-domain` without pushing `main`. After JCS-52 checks are proven, explicitly approve `git.deploymentEnabled: false`, set both readiness variables, and let the custom-CI Production deployment rely on those checks for automatic aliasing. Do not disconnect the repository because Deployment Checks require the integration.

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
