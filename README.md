# Atlaris

[![codecov](https://codecov.io/gh/saldanaj97/atlaris/branch/main/graph/badge.svg)](https://app.codecov.io/gh/saldanaj97/atlaris)

AI-assisted learning plan generator built with Next.js 16.2, React 19, TypeScript, Drizzle, Supabase Postgres, PostgreSQL RLS, Clerk Auth, Stripe, and OpenRouter.

## What the app does

- Creates structured learning plans with ordered modules and tasks
- Streams AI generation progress to the client over SSE
- Tracks generation attempts, failure classifications, and retryability
- Enforces tenant isolation with PostgreSQL Row Level Security (RLS)
- Google Calendar sync is planned (not yet implemented — shown as "Coming Soon" in Settings → Integrations)
- Applies usage limits, rate limiting, and subscription gating server-side

## Core stack

- **Framework:** Next.js 16.2.6 + React 19
- **Language:** TypeScript (strict mode)
- **Database:** Supabase local Postgres / hosted Supabase Postgres via Drizzle ORM
- **Auth:** Clerk for UI, route protection, and server session reads
- **AI:** OpenRouter via `@openrouter/sdk`
- **Payments:** Clerk Billing (Stripe gateway)
- **Testing:** Vitest + Testing Library + Testcontainers

## Getting started

`pnpm install` installs project dependencies only. `pnpm dev` always goes through the mandatory launcher, which fails before Next starts unless these machine-local tools are already present:

1. A global **Portless** executable on `PATH`. Install and PATH notes: [`docs/third-party-services/portless-overview.md`](docs/third-party-services/portless-overview.md#install). First machine also needs `portless trust`.
2. The **1Password CLI** (`op`) plus a keychain-backed wrapper. The service-account token never lives in the repo. Setup: [`docs/third-party-services/1password-local-dev.md`](docs/third-party-services/1password-local-dev.md).
3. A nonempty **`OP_ENVIRONMENT_ID`** in `~/.config/atlaris/dev.sh` (see [`scripts/dev/dev.sh.example`](scripts/dev/dev.sh.example)) or your shell.

```bash
npm install -g portless
export PATH="$(npm prefix -g)/bin:$PATH"
bash scripts/dev/install-local-op.sh --environment-id YOUR_ENVIRONMENT_ID --token-stdin --force-config
pnpm install
pnpm dev doctor   # confirm Portless, 1Password, and OP_ENVIRONMENT_ID
pnpm dev
```

If you want to bring up the Supabase local stack and app together:

```bash
pnpm dev --db
```

Use `pnpm db start` and `pnpm db stop` to control the Supabase local stack, and `pnpm db reset` to recreate the local Supabase database from committed migrations and seed data. `pnpm dev` always runs through Portless at `https://atlaris.localhost` (or the worktree-specific Portless hostname).

Open `https://atlaris.localhost` in your browser.

## Common commands

Quickstart:

```bash
pnpm install
pnpm dev              # Portless + Webpack + Workflow SDK
pnpm dev --ui         # Portless + Turbopack UI-only mode
pnpm dev --db         # Start Supabase, then Portless + Webpack
pnpm dev doctor       # Diagnose the local toolchain and Portless/1Password setup
pnpm check            # lint + typecheck
pnpm test             # lightweight changed unit + integration-class bundle
pnpm db fixture pro   # intentionally set the local product-testing plan
```

Full script reference — flags, scoped test runners, database helpers: [`docs/development/commands.md`](docs/development/commands.md).

On commit, **Husky** runs **`lint-staged`** (Oxlint `--fix` + oxfmt on staged files only). Pre-push runs **`pnpm check`** (full Oxlint + typecheck).

## Project structure

```text
src/
├── app/           # App Router pages + API routes
├── components/    # Shared UI and feature components
├── features/      # Domain features (ai, plans, billing, jobs, lesson-content, integrations)
├── hooks/         # Client hooks
├── lib/
│   ├── api/       # Auth wrappers, errors, rate limiting, helpers
│   ├── auth/      # Auth server/client wiring
│   ├── config/    # Typed environment access
│   ├── db/        # Query modules and shared DB types
│   ├── integrations/ # OAuth token/state utilities
│   ├── logging/   # Server/client logging helpers
│   └── ...
└── types/         # Shared application types
supabase/
├── schema/        # Drizzle schema, relations, and policy definitions
├── migrations/    # Committed DB migrations
├── rls.ts         # RLS client factory
├── runtime.ts     # Request-scoped DB resolver
└── service-role.ts # Service-role DB client for tests/workers
```

## Security model

- Request handlers use `getDb()` from `@supabase/runtime` inside auth wrappers
- Tests, workers, and migrations use the service-role client only where appropriate
- RLS policies are explicitly scoped to `authenticated`
- OAuth state tokens are hashed before persistence
- Error responses flow through the canonical API error contract

## Testing

The default `pnpm test` command runs a lightweight changed-only bundle: unit tests plus integration-class tests filtered to changed files. Integration-class coverage includes DB/API integration tests and the Workflow SDK Vitest harness.

Use the explicit scoped commands for day-to-day work, and prefer targeted integration runs instead of the full suite whenever possible:

```bash
pnpm test
pnpm test unit --changed
pnpm test integration --changed
pnpm test workflow
pnpm test smoke
pnpm test all
```

For direct file targeting:

```bash
pnpm test unit --changed
pnpm test integration --changed
SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest run --config vitest.config.ts --project unit tests/unit/path/to/file.spec.ts
NODE_ENV=test pnpm vitest run --config vitest.config.ts --project integration tests/integration/path/to/file.spec.ts
```

Integration tests normally rely on Testcontainers. If you intentionally want to point at an existing Supabase-compatible database, set `SKIP_TESTCONTAINERS=true` and provide a valid `POSTGRES_URL`.

Workflow SDK Preview validation (`pnpm deploy:preview`), feature flags, and correlation: [docs/architecture/workflow-sdk.md](docs/architecture/workflow-sdk.md).

## Environment and logging

- Do not access `process.env` directly outside `src/lib/config/env.ts`
- Use grouped config exports such as `databaseEnv`, `clerkAuthEnv`, `aiEnv`, `openRouterEnv`, and `loggingEnv`
- Do not use `console.*` in application code — use the logging utilities in `src/lib/logging/`

## Related documentation

- `AGENTS.md`
- `docs/architecture/workflow-sdk.md`
- `docs/third-party-services/portless-overview.md`
- `docs/third-party-services/1password-local-dev.md`
- `docs/architecture/auth-and-data-layer.md`
- `docs/architecture/plan-generation-architecture.md`
- `docs/architecture/internal-worker-routes.md`
- `docs/architecture/regeneration-worker-runbook.md`
- `docs/architecture/retention-cleanup-runbook.md`
- `docs/api/error-contract.md`
- API reference (OpenAPI/Scalar UI): served at `/api/docs` — route `src/app/api/docs/route.ts`
- `docs/database/schema-overview.md`
