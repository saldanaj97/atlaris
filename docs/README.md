# Docs directory

Index of every folder and file under `docs/`. Paths are relative to this file.

## Root

| File | Description |
|------|-------------|
| [CHANGELOG.md](./CHANGELOG.md) | Project changelog |
| [technical-debt.md](./technical-debt.md) | Known technical debt tracker |
| [README.md](./README.md) | This index |

## `ai/`

AI model catalog and related reference.

| File | Description |
|------|-------------|
| [available-models.md](./ai/available-models.md) | OpenRouter models by tier (specs, costs) |

## `api/`

HTTP API contracts shared across routes.

| File | Description |
|------|-------------|
| [error-contract.md](./api/error-contract.md) | Canonical API error response shape |
| [rate-limiting.md](./api/rate-limiting.md) | User-based and job-based rate limiting |

## `architecture/`

System design, pipelines, and operational runbooks.

| File | Description |
|------|-------------|
| [auth-and-data-layer.md](./architecture/auth-and-data-layer.md) | Auth, authorization, RLS / tenant isolation |
| [email-notification-delivery-runbook.md](./architecture/email-notification-delivery-runbook.md) | Email notification scheduler runbook |
| [internal-worker-routes.md](./architecture/internal-worker-routes.md) | Internal `/api/internal/` workers and token auth |
| [plan-cleanup-runbook.md](./architecture/plan-cleanup-runbook.md) | Stuck-plan and orphaned-attempt maintenance |
| [plan-generation-architecture.md](./architecture/plan-generation-architecture.md) | Plan generation pipeline (`POST /api/v1/plans/stream`) |
| [regeneration-worker-runbook.md](./architecture/regeneration-worker-runbook.md) | Queued plan regeneration drain runbook |
| [retention-cleanup-runbook.md](./architecture/retention-cleanup-runbook.md) | DB retention cleanup (tokens, webhooks, jobs) |
| [usage-analytics-metric-contract.md](./architecture/usage-analytics-metric-contract.md) | Usage analytics metric contract |
| [workflow-sdk.md](./architecture/workflow-sdk.md) | Workflow SDK durable execution |

## `ci/`

Contributor CI and branching guidance.

| File | Description |
|------|-------------|
| [branching-strategy.md](./ci/branching-strategy.md) | Branching strategy for contributors |

## `ci-cd/`

Pipeline and deployment strategy.

| File | Description |
|------|-------------|
| [pipeline-and-deployment-strategy.md](./ci-cd/pipeline-and-deployment-strategy.md) | Preview / staging / production pipeline |

## `database/`

Schema and DB client usage.

| File | Description |
|------|-------------|
| [client-usage.md](./database/client-usage.md) | When to use RLS vs service-role clients |
| [schema-overview.md](./database/schema-overview.md) | Core entities and relationships |

## `development/`

Local development, env, deploy, and logging.

| File | Description |
|------|-------------|
| [commands.md](./development/commands.md) | Common `pnpm` and dev commands |
| [deploy.md](./development/deploy.md) | Deployment / migration cutover notes |
| [environment.md](./development/environment.md) | Environment variables and logging guidelines |
| [local-database.md](./development/local-database.md) | Local Supabase CLI stack setup |
| [logging.md](./development/logging.md) | Server/client logging and Sentry |

## `security/`

Security audits and supply-chain policy.

| File | Description |
|------|-------------|
| [security-audit-checklist.md](./security/security-audit-checklist.md) | Pre-launch security checklist (24 areas) |
| [supply-chain-policy.md](./security/supply-chain-policy.md) | pnpm `minimumReleaseAge` policy |

## `styles/`

Brand direction and UI style reference.

| File | Description |
|------|-------------|
| [after-hours-direction.md](./styles/after-hours-direction.md) | Approved After Hours product direction |
| [style-guide.md](./styles/style-guide.md) | Colors, tokens, typography, layout, components |

## `testing/`

Test standards, smoke tests, and UI baselines.

| File | Description |
|------|-------------|
| [browser-smoke-testing.md](./testing/browser-smoke-testing.md) | Historical smoke reference (superseded) |
| [db-test-patterns.md](./testing/db-test-patterns.md) | Drizzle query helper test patterns |
| [playwright-local-smoke.md](./testing/playwright-local-smoke.md) | Current Playwright local smoke lane |
| [smoke-test-results-2026-04-01.md](./testing/smoke-test-results-2026-04-01.md) | Smoke results snapshot (2026-04-01) |
| [test-standards.md](./testing/test-standards.md) | Vitest + Testing Library guidelines |
| [ui-baseline-capture.md](./testing/ui-baseline-capture.md) | Marketing/product UI baseline screenshots |

## `third-party-services/`

External tool and CLI references used in local/dev workflows.

| File | Description |
|------|-------------|
| [1password-agents-setup.md](./third-party-services/1password-agents-setup.md) | 1Password Environments bootstrap for cloud agents |
| [clerk-cli-docs.md](./third-party-services/clerk-cli-docs.md) | Clerk CLI install and usage |
| [portless-commands.md](./third-party-services/portless-commands.md) | Portless CLI commands |
| [portless-overview.md](./third-party-services/portless-overview.md) | Portless overview (named `.localhost` URLs) |

## Tree

```text
docs/
├── README.md
├── CHANGELOG.md
├── technical-debt.md
├── ai/
│   └── available-models.md
├── api/
│   ├── error-contract.md
│   └── rate-limiting.md
├── architecture/
│   ├── auth-and-data-layer.md
│   ├── email-notification-delivery-runbook.md
│   ├── internal-worker-routes.md
│   ├── plan-cleanup-runbook.md
│   ├── plan-generation-architecture.md
│   ├── regeneration-worker-runbook.md
│   ├── retention-cleanup-runbook.md
│   ├── usage-analytics-metric-contract.md
│   └── workflow-sdk.md
├── ci/
│   └── branching-strategy.md
├── ci-cd/
│   └── pipeline-and-deployment-strategy.md
├── database/
│   ├── client-usage.md
│   └── schema-overview.md
├── development/
│   ├── commands.md
│   ├── deploy.md
│   ├── environment.md
│   ├── local-database.md
│   └── logging.md
├── security/
│   ├── security-audit-checklist.md
│   └── supply-chain-policy.md
├── styles/
│   ├── after-hours-direction.md
│   └── style-guide.md
├── testing/
│   ├── browser-smoke-testing.md
│   ├── db-test-patterns.md
│   ├── playwright-local-smoke.md
│   ├── smoke-test-results-2026-04-01.md
│   ├── test-standards.md
│   └── ui-baseline-capture.md
└── third-party-services/
    ├── 1password-agents-setup.md
    ├── clerk-cli-docs.md
    ├── portless-commands.md
    └── portless-overview.md
```
