# AGENTS.md

**Generated:** 2026-01-23 | **Commit:** 06a69c8 | **Branch:** staging

## Overview

AI-powered learning plan generator. Turns goals into time-blocked schedules with calendar sync.  
Stack: Next.js 16 + React 19 + TypeScript strict + Drizzle/Neon (RLS) + Clerk + OpenRouter.

## Structure

```
src/
├── app/           # Next.js App Router (pages + API routes)
├── components/    # Shared UI (billing/, settings/, ui/)
├── lib/
│   ├── ai/        # Provider abstraction, streaming, orchestration → see AGENTS.md
│   ├── api/       # Request context, rate limiting
│   ├── config/    # Centralized env access (NEVER use process.env directly)
│   ├── curation/  # Resource ranking (YouTube, docs)
│   ├── db/        # Schema, queries, RLS clients → see AGENTS.md
│   ├── integrations/ # Notion/Google Calendar sync → see AGENTS.md
│   └── logging/   # Structured logger (NEVER use console.*)
tests/             # 5 test types → see AGENTS.md
docs/rules/        # Extended documentation (load on-demand)
```

## Where to Look

| Task                | Location                     | Notes                                             |
| ------------------- | ---------------------------- | ------------------------------------------------- |
| Add API endpoint    | `src/app/api/v1/`            | Use `getDb()` from runtime, never service-role    |
| DB schema change    | `src/lib/db/schema/tables/`  | Run `pnpm db:generate` after                      |
| AI generation logic | `src/lib/ai/orchestrator.ts` | Provider abstraction in `provider-factory.ts`     |
| Add integration     | `src/lib/integrations/`      | Follow DI pattern (factory + types + sync)        |
| Environment var     | `src/lib/config/env.ts`      | Add to grouped config, validate with Zod          |
| Write tests         | `tests/`                     | Unit in `tests/unit/`, integration needs DB setup |

## Commands

```bash
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm lint && pnpm type-check  # Run before commit

# Testing - NEVER run full suite, only relevant tests
pnpm test                    # Unit tests
pnpm test:changed            # Changed files only
pnpm test:integration        # Integration (requires DB)
./scripts/test-unit.sh path/to/file.spec.ts  # Single file

# Database
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Apply migrations
```

## Critical Rules

### Database Client Selection (Security)

```typescript
// API routes/server actions - ALWAYS use:
import { getDb } from '@/lib/db/runtime';

// Tests/workers ONLY:
import { db } from '@/lib/db/service-role';
```

ESLint blocks service-role imports in `src/app/api/**`, `src/lib/api/**`, `src/lib/integrations/**`.

### TypeScript

- Strict mode - no `any`, no `!` assertions, no `@ts-ignore`
- Use `unknown` for external data, validate with Zod at boundaries
- Prefix unused vars with `_`
- Exported functions need explicit return types

### Imports

- Path alias: `@/*` → `src/*`
- `import type` for type-only imports
- Env: only through `@/lib/config/env`
- Logging: only through `@/lib/logging/logger`

### Naming

| Type        | Convention       | Example          |
| ----------- | ---------------- | ---------------- |
| Directories | lowercase-dashes | `auth-wizard/`   |
| Components  | PascalCase       | `AuthWizard.tsx` |
| Functions   | camelCase        | `fetchUserData`  |
| Constants   | UPPER_SNAKE_CASE | `API_BASE_URL`   |
| Type files  | `*.types.ts`     | `user.types.ts`  |

## Anti-Patterns (Forbidden)

- `process.env.*` directly (use `@/lib/config/env`)
- `console.*` in app code (use `@/lib/logging/logger`)
- Service-role DB in request handlers
- Class components (functional + hooks only)
- `as any`, `@ts-ignore`, non-null assertions
- Running full test suite (`pnpm test:all`)

## Testing Quick Reference

| Type        | Location             | Purpose           | Command                 |
| ----------- | -------------------- | ----------------- | ----------------------- |
| Unit        | `tests/unit/`        | Pure logic, no IO | `pnpm test`             |
| Integration | `tests/integration/` | DB + service      | `pnpm test:integration` |
| E2E         | `tests/e2e/`         | User journeys     | —                       |
| Security    | `tests/security/`    | RLS policies      | —                       |
| Smoke       | `tests/smoke/`       | Startup checks    | —                       |

Use factories from `tests/fixtures/`. Test behavior, not implementation.

## Extended Docs

Load on-demand based on task:

- **Architecture**: `docs/rules/architecture/project-structure.md`
- **TypeScript**: `docs/rules/language-specific/typescript.md`
- **React**: `docs/rules/language-specific/react.md`
- **Testing**: `docs/rules/testing/test-standards.md`
- **Database**: `docs/rules/database/schema-overview.md`
- **Styling**: `docs/rules/styles/styling.md`
- **DI Pattern**: `docs/rules/architecture/dependency-injection-architecture.md`

## Subdirectory Agents

- `src/lib/db/AGENTS.md` - Database clients, RLS, queries
- `src/lib/ai/AGENTS.md` - AI providers, generation, streaming
- `src/lib/integrations/AGENTS.md` - Third-party sync (Notion, GCal)
- `tests/AGENTS.md` - Test architecture and patterns
