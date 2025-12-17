# Project Structure & Architecture

## Overview

- **Framework**: Next.js 15 (TypeScript, React 19) with Turbopack
- **Package Manager**: pnpm
- **Styling**: Tailwind CSS v4 (config-less)
- **Linting**: ESLint flat config with type-aware rules
- **Formatting**: Prettier with Tailwind plugin

## Key Dependencies

| Category  | Libraries                                              |
| --------- | ------------------------------------------------------ |
| Auth      | @clerk/nextjs                                          |
| Database  | drizzle-orm, drizzle-kit, postgres, @neon/neon-js      |
| AI/LLM    | @ai-sdk/openai, @openrouter/sdk, ai (Vercel AI SDK)    |
| Payments  | stripe                                                 |
| UI        | @radix-ui/\*, lucide-react, next-themes, sonner        |
| Utilities | zod, nanoid, p-retry, date-fns, lru-cache, async-mutex |

## Source Layout

TypeScript path alias: `@/*` → `src/*` (defined in tsconfig.json)

### Application Structure (`src/app/`)

```
src/app/
├── api/           # API routes
├── dashboard/     # Dashboard pages
├── landing/       # Landing page
├── plans/         # Learning plans pages
├── pricing/       # Pricing page
└── settings/      # User settings
```

### Database Code (`src/lib/db/`)

```
src/lib/db/
├── index.ts          # Main entry (RLS-enforced clients)
├── service-role.ts   # Service-role client (RLS bypassed)
├── rls.ts            # RLS-enforced client factory
├── runtime.ts        # Runtime DB selector (getDb())
├── enums.ts          # PostgreSQL enum definitions
├── usage.ts          # Usage tracking queries
├── seed.ts           # Database seeding
├── schema/           # Table definitions + RLS policies
├── queries/          # Modular query files by entity
└── migrations/       # Drizzle migrations output
```

### AI/Streaming (`src/lib/ai/`)

```
src/lib/ai/
├── provider-factory.ts   # AI provider configuration
├── orchestrator.ts       # Generation orchestration
└── streaming/            # Streaming utilities
```

### Tests (`tests/`)

```
tests/
├── unit/          # Isolated component tests
├── integration/   # Multi-component tests
├── e2e/           # End-to-end user flows
├── security/      # RLS policy tests
├── fixtures/      # Test data fixtures
├── helpers/       # Test utilities
├── mocks/         # Mock implementations
└── setup.ts       # Global test setup
```

## Configuration Files

| File                     | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `next.config.ts`         | Next.js configuration (minimal, Turbopack) |
| `eslint.config.mjs`      | ESLint flat config (type-aware)            |
| `.prettierrc`            | Prettier configuration                     |
| `tsconfig.json`          | TypeScript configuration                   |
| `drizzle.config.ts`      | Drizzle ORM config (main)                  |
| `drizzle-test.config.ts` | Drizzle ORM config (test)                  |
| `vitest.config.ts`       | Vitest multi-project config                |

## ESLint Configuration

Key features of our ESLint setup:

- **Type-aware linting**: Uses `typescript-eslint` with `recommendedTypeChecked`
- **Import ordering**: `import-x` plugin with TypeScript resolver
- **No enums**: Disallowed via `no-restricted-syntax`; use const objects instead
- **React Hooks**: Strict enforcement (rules-of-hooks, exhaustive-deps)
- **Next.js**: Core Web Vitals rules included
- **Prettier**: Compatibility layer to disable formatting rules

## Styling Notes

- Tailwind CSS v4 is config-less
- Prettier Tailwind plugin sorts class names
- `.prettierignore` excludes `src/components/ui/*.tsx`
