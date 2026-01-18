# AGENTS.md

Instructions for AI agents working in this codebase. Follow these rules strictly.

## Tech Stack

| Category    | Technology                               |
| ----------- | ---------------------------------------- |
| Framework   | Next.js 16 (React 19, Turbopack)         |
| Language    | TypeScript (strict mode)                 |
| Package Mgr | pnpm                                     |
| Styling     | Tailwind CSS v4                          |
| Auth        | @clerk/nextjs                            |
| Database    | Drizzle ORM + Neon (PostgreSQL with RLS) |
| AI/LLM      | Vercel AI SDK + OpenRouter               |
| Testing     | Vitest + React Testing Library           |

## Commands

### Development

```bash
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # Run ESLint
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Run Prettier
pnpm type-check       # TypeScript check only
```

### Testing (CRITICAL)

**NEVER run the full test suite.** Only run tests relevant to the current task.

```bash
# Unit tests (preferred for development)
pnpm test                              # Run all unit tests
pnpm test:changed                      # Run tests for changed files only
pnpm test:watch                        # Watch mode
./scripts/test-unit.sh tests/unit/path/to/file.spec.ts  # Single test file

# Integration tests (requires Docker)
pnpm test:integration                  # Run integration tests
./scripts/test-integration.sh tests/integration/path/to/file.spec.ts

# Full suite (rarely needed)
pnpm test:all                          # All tests (unit + integration)
```

### Database

```bash
pnpm db:generate      # Generate migrations from schema
pnpm db:migrate       # Apply migrations
pnpm db:push          # Push schema directly (dev only)
```

## Code Style

### TypeScript

- **Strict mode enabled** - no `any`, no `!` assertions, no `@ts-ignore`
- Use `unknown` for external data, validate at boundaries with Zod
- Prefix unused variables with `_` (e.g., `_unused`)
- Use `const` objects instead of enums (enforced by ESLint)
- Exported functions must have explicit return types

### Naming Conventions

| Type             | Convention       | Example                  |
| ---------------- | ---------------- | ------------------------ |
| Directories      | lowercase-dashes | `components/auth-wizard` |
| Components/Files | PascalCase       | `AuthWizard.tsx`         |
| Functions/Vars   | camelCase        | `fetchUserData`          |
| Constants        | UPPER_SNAKE_CASE | `API_BASE_URL`           |
| Type-only files  | `*.types.ts`     | `user.types.ts`          |

### Imports

- Use `@/*` path alias for `src/*` imports
- Use `import type` for type-only imports
- All env access must go through `@/lib/config/env` (never use `process.env` directly)
- Use `@/lib/logging/logger` for logging (never use `console.*` in app code)

### React/Next.js

- Functional components with hooks only (no classes)
- Minimize `'use client'` - prefer React Server Components
- Use `useEffect` with proper dependency arrays and cleanup functions
- Follow rules of hooks strictly (`react-hooks/rules-of-hooks: error`)

### Formatting (Prettier)

- 2 spaces, single quotes, trailing commas (ES5), semicolons
- 80 char line width, LF line endings
- Tailwind classes auto-sorted via prettier-plugin-tailwindcss

## Database Rules

### Client Selection (CRITICAL for security)

```typescript
// In API routes/server actions - USE THIS:
import { getDb } from '@/lib/db/runtime'; // RLS-enforced

// In tests/internal operations ONLY:
import { db } from '@/lib/db/service-role'; // Bypasses RLS
```

ESLint blocks `@/lib/db/service-role` imports in `src/app/api/**`, `src/lib/api/**`, `src/lib/integrations/**`.

## Testing Guidelines

### Test Types

| Type        | Location             | Purpose                   |
| ----------- | -------------------- | ------------------------- |
| Unit        | `tests/unit/`        | Pure logic, no IO         |
| Integration | `tests/integration/` | DB + service + validation |
| E2E         | `tests/e2e/`         | Critical user journeys    |
| Security    | `tests/security/`    | RLS policy verification   |

### Rules

- Test behavior, not implementation
- Prefer dependency injection over module mocking
- Use factories from `tests/fixtures/` for test data
- Never assert on CSS class names - test semantic behavior
- No arbitrary sleeps - wait for specific states

## Error Handling

- Never throw strings - use Error objects
- Preserve original error as `cause` when wrapping
- Use early returns for error conditions
- Implement guard clauses for preconditions

## Commits

Only follow commit format for **code changes** (not docs/tests):

```
<type>: <short summary (50 chars max)>

<detailed description>

Changes:
- <bullet points>

New files:
- <paths>
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`

**Before committing:**

1. Run `pnpm lint` and `pnpm type-check`
2. Only stage files modified for the current task
3. Never include unrelated changes

## Project Structure

```
src/
├── app/           # Next.js App Router (pages, API routes)
├── components/    # Shared React components
├── lib/
│   ├── config/    # Environment config (env.ts)
│   ├── db/        # Drizzle schema, queries, clients
│   ├── ai/        # AI provider config, streaming
│   ├── api/       # API utilities, rate limiting
│   └── logging/   # Structured logging
tests/
├── unit/          # Fast, isolated tests
├── integration/   # DB-dependent tests
├── e2e/           # User journey tests
├── fixtures/      # Test data factories
└── setup.ts       # Global test setup
```

## Documentation References

Load these on-demand based on the task:

- Architecture: `docs/rules/architecture/project-structure.md`
- TypeScript: `docs/rules/language-specific/typescript.md`
- React: `docs/rules/language-specific/react.md`
- Testing: `docs/rules/testing/test-standards.md`
- Database: `docs/rules/database/schema-overview.md`
- Styling: `docs/rules/styles/styling.md`
