# Atlaris

[![codecov](https://codecov.io/gh/saldanaj97/atlaris/branch/main/graph/badge.svg)](https://app.codecov.io/gh/saldanaj97/atlaris)

AI-assisted learning plan generator built with Next.js 16.2, React 19, TypeScript, Drizzle, Neon RLS, Neon Auth, Stripe, and OpenRouter.

## What the app does

- Creates structured learning plans with ordered modules and tasks
- Streams AI generation progress to the client over SSE
- Tracks generation attempts, failure classifications, and retryability
- Enforces tenant isolation with Neon Row Level Security (RLS)
- Supports Google Calendar OAuth token storage and disconnect flows
- Applies usage limits, rate limiting, and subscription gating server-side

## Core stack

- **Framework:** Next.js 16.2.4 + React 19
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL on Neon via Drizzle ORM
- **Auth:** `@neondatabase/auth` + `better-auth`
- **AI:** OpenRouter via `@openrouter/sdk` and the Vercel AI SDK
- **Payments:** Stripe
- **Testing:** Vitest + Testing Library + Testcontainers

## Getting started

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

If you want to bring up the native local dev database and app together:

```bash
pnpm dev:full
```

Use `pnpm db:dev:start` and `pnpm db:dev:stop` to control the local PostgreSQL 17 service directly, and `pnpm db:dev:reset` if you want to recreate `atlaris_dev`.

Open `http://localhost:3000` in your browser.

## Common commands

Quickstart:

```bash
pnpm install
pnpm dev              # Turbopack app only
pnpm dev:full        # local DB + app
pnpm check:full      # lint + type-check (runs check:lint + check:type)
pnpm test            # lightweight changed bundle (same as test:changed)
```

Full script reference — flags, scoped test runners, database helpers: [`docs/development/commands.md`](docs/development/commands.md).

On commit, **Husky** runs **`lint-staged`** (Oxlint `--fix` + Prettier on staged files only). Pre-push runs **`pnpm check:full`** (full Oxlint + typecheck).

## Project structure

```text
src/
├── app/           # App Router pages + API routes
├── components/    # Shared UI and feature components
├── hooks/         # Client hooks
├── lib/
│   ├── ai/        # Providers, orchestration, parsing, streaming
│   ├── api/       # Auth wrappers, errors, rate limiting, helpers
│   ├── auth/      # Auth server/client wiring
│   ├── config/    # Typed environment access
│   ├── db/        # Schema, queries, RLS/service-role clients, migrations
│   ├── integrations/ # OAuth token/state utilities
│   ├── logging/   # Server/client logging helpers
│   └── ...
└── types/         # Shared application types
```

## Security model

- Request handlers use `getDb()` from `@/lib/db/runtime` inside auth wrappers
- Tests, workers, and migrations use the service-role client only where appropriate
- RLS policies are explicitly scoped to `authenticated`
- OAuth state tokens are hashed before persistence
- Error responses flow through the canonical API error contract

## Testing

The default `pnpm test` command runs a lightweight changed-only bundle: unit tests plus integration tests filtered to changed files.

Use the explicit scoped commands for day-to-day work, and prefer targeted integration runs instead of the full suite whenever possible:

```bash
pnpm test:changed
pnpm test:unit:changed
pnpm test:integration:changed
```

For direct file targeting:

```bash
pnpm exec tsx scripts/tests/run.ts changed
pnpm exec tsx scripts/tests/run.ts unit path/to/file.spec.ts
pnpm exec tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts
```

Integration tests normally rely on Testcontainers. If you intentionally want to point at an existing database, set `SKIP_TESTCONTAINERS=true` and provide a valid `DATABASE_URL`.

## Environment and logging

- Do not access `process.env` directly outside `src/lib/config/env.ts`
- Use grouped config exports such as `databaseEnv`, `neonAuthEnv`, `stripeEnv`, `aiEnv`, `openRouterEnv`, and `loggingEnv`
- Do not use `console.*` in application code — use the logging utilities in `src/lib/logging/`

## Related documentation

- `AGENTS.md`
- `docs/architecture/auth-and-data-layer.md`
- `docs/architecture/plan-generation-architecture.md`
- `docs/api/error-contract.md`
- `docs/database/schema-overview.md`
