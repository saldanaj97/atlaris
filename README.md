# Atlaris

[![codecov](https://codecov.io/gh/saldanaj97/atlaris/branch/main/graph/badge.svg)](https://app.codecov.io/gh/saldanaj97/atlaris)

AI-assisted learning plan generator built with Next.js 16, React 19, TypeScript, Drizzle, Neon RLS, Neon Auth, Stripe, and OpenRouter.

## What the app does

- Creates structured learning plans with ordered modules and tasks
- Streams AI generation progress to the client over SSE
- Tracks generation attempts, failure classifications, and retryability
- Enforces tenant isolation with Neon Row Level Security (RLS)
- Supports Google Calendar OAuth token storage and disconnect flows
- Applies usage limits, rate limiting, and subscription gating server-side

## Core stack

- **Framework:** Next.js 16.1.6 + React 19
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

Open `http://localhost:3000` in your browser.

## Common commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm test:changed
pnpm test:watch
pnpm test:integration
pnpm db:generate
pnpm db:migrate
pnpm db:push
```

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

The default `pnpm test` command runs the unit suite through `./scripts/test-unit.sh`.

Use targeted integration runs instead of the full suite whenever possible:

```bash
./scripts/test-unit.sh path/to/file.spec.ts
./scripts/test-integration.sh tests/integration/path/to/file.spec.ts
```

Integration tests normally rely on Testcontainers. If you intentionally want to point at an existing database, set `SKIP_TESTCONTAINERS=true` and provide a valid `DATABASE_URL`.

## Environment and logging

- Do not access `process.env` directly outside `src/lib/config/env.ts`
- Use grouped config exports such as `databaseEnv`, `neonAuthEnv`, `stripeEnv`, `aiEnv`, `openRouterEnv`, and `loggingEnv`
- Do not use `console.*` in application code — use the logging utilities in `src/lib/logging/`

## Related documentation

- `AGENTS.md`
- `docs/context/architecture/auth-and-data-layer.md`
- `docs/context/architecture/plan-generation-architecture.md`
- `docs/rules/api/error-contract.md`
- `docs/rules/database/schema-overview.md`
