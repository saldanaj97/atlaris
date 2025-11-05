# AGENTS.md

This file provides guidance when working with code in this repository.

## Repository overview

- Framework: Next.js 15 (TypeScript, React 19) using Turbopack for dev/build
- Package manager: pnpm (pnpm-lock.yaml present)
- Styling: Tailwind CSS v4 (config-less), with prettier-plugin-tailwindcss
- Linting: ESLint flat config (eslint.config.mjs) with type-aware rules and import-x
- Formatting: Prettier (.prettierrc, .prettierignore)
- Type checking: tsc --noEmit
- Notable deps:
  - Auth: @clerk/nextjs
  - Database: @supabase/supabase-js, @supabase/ssr, drizzle-orm, drizzle-kit, drizzle-seed, postgres
  - AI/LLM: @ai-sdk/google, @ai-sdk/openai, ai (Vercel AI SDK)
  - Payments: stripe
  - UI: @radix-ui/\*, lucide-react, next-themes, sonner, class-variance-authority, tailwind-merge
  - Background workers: tsx (for worker execution), async-mutex (test coordination)
  - Utilities: zod, nanoid, p-retry, dotenv, date-fns, lru-cache

## Important Rules/References(read before coding or committing)

### General rules

- When you are done with code implementation, run the command: `coderabbit --prompt-only -t uncommitted` to review the code changes.
- Only run the CodeRabbit CLI command on changes to actual code, not any .md files or other non-code files.
- When given the proposed changes, review the changes and make sure they are correct, and make any necessary adjustments.

- Ignore any assumptions you may have about how this project works based on your prior experience. This project has its own specific architecture, structure, and conventions that must be followed. Reason from facts only.

- NEVER run the full test suite. Only run the tests that are relevant to the task at hand, have been explicitly requested, or are newly added. When running tests, use the 'vitest' command with the appropriate flags. NOT the 'pnpm test' command.

- Make sure to ALWAYS use the context7 MCP for grabbing the most up to date documentation about a specific topic before starting any coding task or when I ask you a clarifying question. This will ensure you have the most up to date information and avoid any mistakes.

- When dealing with database changes, make sure to always push the schema to the test database as well as the local database using the appropriate commands.

### Dealing with specific github issues or tasks

- When working on a specific github issue or task, make sure to ALWAYS refer to the specific instructions, requirements, and testing needs defined in the issue or task description. Do not make any assumptions or add any extra features that are not explicitly requested.
- If the issue or task references any specific files, make sure to read those files carefully and understand their purpose before making any changes.
- If the issue or task has any dependencies on other issues or tasks, make sure to address those dependencies first before proceeding with the current task.
- If the issue or task references any documentation, designs, or other resources, make sure to review those materials thoroughly to ensure your implementation aligns with the intended goals.
- If the issue has subtasks or related issues, make sure to consider their requirements and testing needs as well.
- When you are done with the implementation, make sure to go back over the issue, task, and any related subtasks to ensure that all requirements have been met and all tests have been covered. When they have been met, make sure to mark the issue, subissue, or task as complete.

### Commit guidelines

- When writing commit messages, follow the structure and guidelines outline in the .github/instructions/commit-message.instructions.md file. Below is a summary of the structure but make sure to read the full instructions in that file.
- When commiting, make sure to only stage and commit files that were discussed and modified as part of the task at hand. Do not include unrelated files or changes in the commit.
- Before comitting, make sure the changes have been linted, typechecked and the project builds successfully.

**Commit message format**

Follow this structured format for all commit messages:

```
<type>: <short summary (50 chars max)>
<blank line>
<detailed description explaining the what and why>
<continuation of description if needed>
<blank line>
Changes:
- <bullet point of changes>
- <bullet point of changes>
- <bullet point of changes>
<blank line>
New files:
- <path to new file>
- <path to new file>
<blank line>
Tests cover:
- <test description with test ID if applicable>
- <test description with test ID if applicable>
```

## Common commands

- Dev server (do not auto-run; listed for reference)
  - pnpm dev (Next.js dev server)
  - pnpm dev:worker (background worker for job processing)
  - pnpm dev:regenerator (background worker for plan regeneration)
  - pnpm dev:stripe (Stripe webhook listener for local testing)
  - pnpm dev:all (runs all four services concurrently)
- Build (do not auto-run; listed for reference)
  - pnpm build
- Start production server (do not auto-run; listed for reference)
  - pnpm start
  - pnpm worker:start (start worker in production)
- Lint (type-aware, flat config)
  - pnpm lint
  - pnpm lint:fix
- Format (Prettier; Tailwind class sorting enabled)
  - pnpm format
  - To format arbitrary files: pnpm exec prettier --write <path>
- Type check only
  - pnpm type-check
- Database (Drizzle)
  - Generate migrations: pnpm db:generate
  - Apply migrations: pnpm db:migrate
  - Push schema to DB: pnpm db:push
  - Push schema to test DB: pnpm db:push:test
  - Seed database: pnpm seed (development mode)
  - Custom seed: pnpm seed:custom
  - Reset database: pnpm seed:reset
  - Full refresh: pnpm seed:refresh
- Tests
  - pnpm test (all tests)
  - pnpm test:unit:full (all unit tests with DB setup)
  - pnpm test:unit:fast (unit tests skipping DB setup via SKIP_DB_TEST_SETUP=true)
  - pnpm test:unit:related (unit tests for changed files)
  - pnpm test:integration:full (all integration tests via bash script)
  - pnpm test:integration:related (integration tests for changed files)
  - pnpm test:e2e:full (all e2e tests via bash script)
  - pnpm test:e2e:related (e2e tests for changed files)
  - pnpm test:rls:full (Row Level Security tests via bash script)
  - pnpm test:rls:related (RLS tests for changed files)
  - pnpm test:suite:full (full test suite without e2e)
  - pnpm test:suite:all (complete suite including e2e)
  - pnpm test:watch (watch mode)

## Project structure and architecture

- Source layout
  - TypeScript path alias @/\* -> src/\* (tsconfig.json)
  - ESLint targets src/\*\* and references Next.js App Router conventions (e.g., src/app/\*\*/route.ts). The intended source root is src/, with Next.js app/ under src/app/.
  - src/app/ structure:
    - api/ - API routes
    - dashboard/ - Dashboard pages
    - landing/ - Landing page
    - plans/ - Learning plans pages
    - pricing/ - Pricing page
    - settings/ - User settings
  - Database code:
    - src/lib/db/schema.ts - Database schema definitions
    - src/lib/db/enums.ts - PostgreSQL enum definitions
    - src/lib/db/drizzle.ts - Drizzle client initialization
    - src/lib/db/queries.ts - Database queries (legacy, being modularized)
    - src/lib/db/queries/ - Modular query files (users.ts, plans.ts, modules.ts, tasks.ts, resources.ts, schedules.ts, attempts.ts, index.ts)
    - src/lib/db/seed.ts, src/lib/db/seed-cli.ts - Database seeding utilities
    - src/lib/db/usage.ts - Usage tracking queries
    - src/lib/db/migrations/ - Drizzle migrations output directory
  - Background workers: src/workers/ (index.ts, plan-generator.ts, plan-regenerator.ts)
  - Tests: tests/ directory with subdirectories (unit/, integration/, e2e/, security/)
  - Documentation: docs/ directory (project-info/, testing/, proposals/, etc.)

- Next.js configuration
  - next.config.ts is minimal and uses default Next 15 behavior; Turbopack is enabled via scripts (next dev/build --turbopack).
  - React 19 and Next 15 are assumed across the project.

- Linting details (eslint.config.mjs)
  - Uses typescript-eslint recommendedTypeChecked configs with parserOptions.project for type-aware linting.
  - import-x with TypeScript resolver configured (resolves tsconfig paths and types; prevents unresolved imports and duplicate imports; enforces ordered, grouped imports).
  - React Hooks rules are enforced strictly (rules-of-hooks, exhaustive-deps).
  - Disallows enums via a no-restricted-syntax rule; prefer const objects/maps instead.
  - Next recommended Core Web Vitals rules included via FlatCompat.
  - Prettier compatibility applied to disable formatting-related ESLint rules.

- Styling & formatting
  - Tailwind CSS v4 is present (config-less). The Prettier Tailwind plugin sorts class names for consistency.
  - .prettierignore excludes build artifacts, .next, lockfiles, etc. It also excludes src/components/ui/\*.tsx specifically.

- Authentication and data
  - Authentication: @clerk/nextjs for user authentication
  - Database: Drizzle ORM with postgres-js + Supabase
    - Connection: src/lib/db/drizzle.ts uses DATABASE_URL (store in .env.local or .env.test). For Supabase, include `?sslmode=require`.
    - Schema: src/lib/db/schema.ts (tables) + src/lib/db/enums.ts (PostgreSQL enums)
    - Queries: src/lib/db/queries/ (modular query files by entity) + src/lib/db/queries.ts (legacy)
    - Migrations: managed via drizzle-kit; out dir is src/lib/db/migrations/
    - RLS policies: Defined in schema using pgPolicy for Supabase Row Level Security
  - Payments: Stripe integration for subscription billing
  - AI providers: Vercel AI SDK with OpenAI and Google providers for learning plan generation
  - Background jobs: Worker infrastructure in src/workers/ for async plan generation

## Database schema overview (MVP)

- Core entities and relationships
  - users 1—\* learning_plans
  - learning_plans 1—\* modules
  - modules 1—\* tasks
  - tasks — resources via task_resources (ordered per task)
  - users — tasks via task_progress (per-user status; derive module/plan completion)
  - learning_plans 1—\* plan_generations (regeneration history/attempts)
  - Background job queue for async plan generation
- Enums (DB-level, defined in src/lib/db/enums.ts)
  - skill_level: beginner | intermediate | advanced
  - learning_style: reading | video | practice | mixed
  - resource_type: youtube | article | course | doc | other
  - progress_status: not_started | in_progress | completed
  - generation_status: generating | ready | failed
  - job_status: pending | processing | completed | failed
  - job_type: plan_generation
  - subscription_tier: free | starter | pro
  - subscription_status: active | canceled | past_due | trialing
- Key constraints and design choices
  - UUID primary keys on all tables; users.id is the internal PK
  - users: clerk_user_id UNIQUE, email UNIQUE
  - FKs generally use ON DELETE CASCADE to avoid orphans
  - Stable ordering: unique(plan_id, order) on modules; unique(module_id, order) on tasks (order starts at 1)
  - CHECK non-negative integers where applicable: weekly_hours, estimated_minutes, duration_minutes, cost_cents
  - Timestamps: created_at default now(); maintain updated_at in app logic or triggers
- Indexes (common query patterns)
  - learning_plans(user_id); optional topic search index (FTS/trigram)
  - modules(plan_id), modules(plan_id, order)
  - tasks(module_id), tasks(module_id, order)
  - task_progress(user_id), task_progress(task_id)
  - resources(url UNIQUE), resources(type)
  - task_resources(task_id), task_resources(resource_id)
  - plan_generations(plan_id)
- Code locations
  - Schema: src/lib/db/schema.ts (tables + RLS policies)
  - Enums: src/lib/db/enums.ts (PostgreSQL enum definitions)
  - Queries: src/lib/db/queries/ (modular query files by entity) + src/lib/db/queries.ts (legacy)
  - Usage tracking: src/lib/db/usage.ts
  - Seeding: src/lib/db/seed.ts, src/lib/db/seed-cli.ts
  - Migrations: src/lib/db/migrations/ (drizzle-kit output)
  - Drizzle configs: drizzle.config.ts (main), drizzle-test.config.ts (test env)
- Implemented features
  - Stripe subscription billing (implemented)
  - Background job processing for AI plan generation
  - Row Level Security (RLS) policies with Supabase
  - Usage tracking and quotas
- Future considerations
  - Topic search indexing can be added later
  - Exports/integrations (Notion/Google) are out of scope for current MVP

## Testing

- **Primary reference**: See [docs/testing/testing.md](docs/testing/testing.md) for comprehensive testing documentation. Always update this file with testing-related changes.
- Framework: Vitest with @testing-library/react and @testing-library/jest-dom
- Test organization (tests/ directory):
  - tests/unit/ - Isolated component tests (AI providers, utilities, parsing, validation)
  - tests/integration/ - Multi-component tests (API contracts, concurrency, workers, RLS)
  - tests/e2e/ - End-to-end user flows
  - tests/security/ - Row Level Security (RLS) policy tests
  - tests/setup.ts - Global test setup file
- Test configuration:
  - vitest.config.ts - Multi-project config (integration, e2e, security, unit)
  - Integration/e2e/security: Single-threaded execution with DB setup to prevent conflicts
  - Unit tests: Concurrent execution with optional DB setup skip via SKIP_DB_TEST_SETUP
  - Uses .env.test for test environment variables (falls back to .env locally)
  - Isolated test environment with jsdom for React component testing
  - Test timeouts: 90s for integration/e2e/security, 20s for unit tests
- Test files: \*.spec.ts, \*.spec.tsx
- Test commands:
  - pnpm test (all tests)
  - pnpm test:unit:full (all unit tests with DB setup)
  - pnpm test:unit:fast (unit tests skipping DB setup via SKIP_DB_TEST_SETUP=true)
  - pnpm test:unit:related (unit tests for changed files)
  - pnpm test:integration:full (all integration tests via bash script)
  - pnpm test:integration:related (integration tests for changed files)
  - pnpm test:e2e:full (all e2e tests via bash script)
  - pnpm test:e2e:related (e2e tests for changed files)
  - pnpm test:rls:full (Row Level Security tests via bash script)
  - pnpm test:rls:related (RLS tests for changed files)
  - pnpm test:suite:full (full test suite without e2e)
  - pnpm test:suite:all (complete suite including e2e)
  - pnpm test:watch (watch mode)

## Notes for future tasks

- Prefer pnpm for all commands in this repo.
