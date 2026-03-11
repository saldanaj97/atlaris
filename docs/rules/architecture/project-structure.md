# Project Structure & Architecture

## Overview

- **Framework:** Next.js 16.1.6 + React 19
- **Language:** TypeScript (strict mode)
- **Package Manager:** pnpm
- **Styling:** Tailwind CSS v4
- **Auth:** `@neondatabase/auth` + `better-auth`
- **Database:** Drizzle ORM + Neon PostgreSQL + Postgres.js
- **AI:** `@openrouter/sdk`, `@ai-sdk/openai`, `ai`
- **Observability:** `@sentry/nextjs`

## Key Dependencies

| Category  | Libraries                                                            |
| --------- | -------------------------------------------------------------------- |
| Auth      | `@neondatabase/auth`, `better-auth`                                  |
| Database  | `drizzle-orm`, `drizzle-kit`, `postgres`, `@neondatabase/serverless` |
| AI/LLM    | `@openrouter/sdk`, `@ai-sdk/openai`, `ai`                            |
| Payments  | `stripe`                                                             |
| UI        | Radix UI primitives, `lucide-react`, `next-themes`, `sonner`         |
| Utilities | `zod`, `nanoid`, `p-retry`, `date-fns`, `lru-cache`, `async-mutex`   |

## Source Layout

TypeScript path alias: `@/*` → `src/*`.

### App Router (`src/app/`)

```text
src/app/
├── api/            # Route handlers, docs, health, internal jobs
├── about/          # Marketing/about page
├── analytics/      # Placeholder analytics pages
├── auth/           # Auth route segments
├── dashboard/      # Authenticated dashboard
├── landing/        # Public landing page
├── plans/          # Plan creation, listing, detail pages
├── pricing/        # Pricing page
└── settings/       # Profile, billing, integrations, notifications
```

### Core Libraries (`src/lib/`)

```text
src/lib/
├── ai/             # Providers, orchestration, parsing, streaming, pacing
├── api/            # Auth wrappers, errors, responses, rate limiting
├── auth/           # Neon Auth server/client wiring
├── config/         # Typed environment access and validation
├── db/             # Schema, queries, RLS client, service-role client, migrations
├── integrations/   # OAuth token/state utilities
├── jobs/           # Queue and regeneration worker logic
├── logging/        # Server/client/request logging helpers
├── metrics/        # Runtime metrics for attempts and billing reconciliation
├── pdf/            # PDF extraction and structure helpers
├── scheduling/     # Schedule distribution and hashing
├── security/       # AV scanning and PDF extraction proofing
└── stripe/         # Billing client, usage, limits, subscriptions
```

### Database Code (`src/lib/db/`)

```text
src/lib/db/
├── runtime.ts        # Request-scoped `getDb()` selector
├── service-role.ts   # Service-role client (tests/workers only)
├── rls.ts            # Authenticated / anonymous RLS client factory
├── enums.ts          # Postgres enums
├── usage.ts          # Usage tracking helpers
├── schema/
│   ├── tables/       # Table definitions and RLS policies
│   ├── relations.ts  # Drizzle relations
│   ├── constants.ts  # Shared DB-layer constants
│   └── index.ts      # Schema barrel
├── queries/          # Query modules by entity / concern
└── migrations/       # Drizzle migration output
```

### AI Code (`src/lib/ai/`)

```text
src/lib/ai/
├── provider.ts          # Provider errors + compatibility shim
├── provider-factory.ts  # Provider/model selection
├── orchestrator.ts      # Main generation pipeline
├── parser.ts            # Stream parsing + validation
├── classification.ts    # Failure classification
├── pacing.ts            # Fit generated output to available hours
├── generation-policy.ts # Durable generation window policy
├── providers/           # OpenRouter, router wrapper, mock provider
├── streaming/           # SSE event utilities and sanitization
└── types/               # Canonical provider + model types
```

### Tests (`tests/`)

```text
tests/
├── unit/          # Pure logic and UI tests
├── integration/   # DB + service tests
├── e2e/           # User-journey tests
├── security/      # RLS and policy tests
├── fixtures/      # Test data builders
├── helpers/       # Shared testing utilities
├── mocks/         # Shared and unit mocks
└── setup.ts       # Integration/e2e/security global setup
```

## Configuration Files

| File                 | Purpose                            |
| -------------------- | ---------------------------------- |
| `next.config.ts`     | Next.js configuration              |
| `eslint.config.mjs`  | ESLint flat config                 |
| `.prettierrc`        | Prettier configuration             |
| `tsconfig.json`      | TypeScript configuration           |
| `drizzle.config.ts`  | Drizzle migration / schema config  |
| `vitest.config.ts`   | Vitest multi-project configuration |
| `postcss.config.mjs` | Tailwind/PostCSS configuration     |

## Conventions

- Use `@/*` path aliases, not deep relative imports
- Access env only through `src/lib/config/env.ts`
- Use `getDb()` in request handlers and `db` from `service-role.ts` only in tests/workers/migrations
- Keep RLS policies explicitly scoped with `to: 'authenticated'`
- Use shadcn/ui components from `src/components/ui/` when available
