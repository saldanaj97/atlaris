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
- **Payments:** Stripe
- **Testing:** Vitest + Testing Library + Testcontainers

## Getting started

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

If you want to bring up the Supabase local stack and app together:

```bash
pnpm dev:full
```

Use `pnpm db:dev:start` and `pnpm db:dev:stop` to control the Supabase local stack, and `pnpm db:dev:reset` to recreate the local Supabase database from committed migrations and seed data.

Open `http://localhost:3000` in your browser.

## Common commands

Quickstart:

```bash
pnpm install
pnpm dev              # Turbopack app only
pnpm dev:full        # local DB + app
pnpm check:full      # lint + type-check (runs check:lint + check:type)
pnpm test            # lightweight changed unit + integration-class bundle
```

Full script reference — flags, scoped test runners, database helpers: [`docs/development/commands.md`](docs/development/commands.md).

On commit, **Husky** runs **`lint-staged`** (Oxlint `--fix` + oxfmt on staged files only). Pre-push runs **`pnpm check:full`** (full Oxlint + typecheck).

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
pnpm test:unit:changed
pnpm test:integration:changed
pnpm test:workflow
```

For direct file targeting:

```bash
pnpm exec tsx scripts/tests/run.ts changed
pnpm exec tsx scripts/tests/run.ts unit path/to/file.spec.ts
pnpm exec tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts
```

Integration tests normally rely on Testcontainers. If you intentionally want to point at an existing Supabase-compatible database, set `SKIP_TESTCONTAINERS=true` and provide a valid `POSTGRES_URL`.

Workflow SDK runtime, local dev (`pnpm dev:workflow`), feature flags, and correlation: [docs/architecture/workflow-sdk.md](docs/architecture/workflow-sdk.md).

## Environment and logging

- Do not access `process.env` directly outside `src/lib/config/env.ts`
- Use grouped config exports such as `databaseEnv`, `clerkAuthEnv`, `stripeEnv`, `aiEnv`, `openRouterEnv`, and `loggingEnv`
- Do not use `console.*` in application code — use the logging utilities in `src/lib/logging/`

## Related documentation

- `AGENTS.md`
- `docs/architecture/workflow-sdk.md`
- `docs/architecture/auth-and-data-layer.md`
- `docs/architecture/plan-generation-architecture.md`
- `docs/architecture/internal-worker-routes.md`
- `docs/architecture/regeneration-worker-runbook.md`
- `docs/architecture/retention-cleanup-runbook.md`
- `docs/api/error-contract.md`
- API reference (OpenAPI/Scalar UI): served at `/api/docs` — route `src/app/api/docs/route.ts`
- `docs/database/schema-overview.md`
