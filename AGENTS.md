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
  - Database: @neon/neon-js, @neon/ssr, drizzle-orm, drizzle-kit, drizzle-seed, postgres
  - AI/LLM: @ai-sdk/openai, @openrouter/sdk, ai (Vercel AI SDK) - OpenRouter is the sole AI provider
  - Payments: stripe
  - UI: @radix-ui/\*, lucide-react, next-themes, sonner, class-variance-authority, tailwind-merge
  - Utilities: zod, nanoid, p-retry, dotenv, date-fns, lru-cache, async-mutex

## General rules and references(read before coding or committing)

### General rules

- NEVER run the full test suite. Only run the tests that are relevant to the task at hand, have been explicitly requested, or are newly added. When running tests, use the 'vitest' command with the appropriate flags. NOT the 'pnpm test' command.

- When I ask you a clarifying question, make sure to use the context7 MCP for grabbing the most up to date documentation. This will ensure you have the most up to date information and avoid any mistakes.

### Testing rules and guidelines

- When writing or reviewing tests, make sure to follow the specific testing guidelines outlined in:
  - `.cursor/rules/integration-testing.mdc` for integration tests
  - `.cursor/rules/unit-testing.mdc` for unit tests
  - `.cursor/rules/e2e-testing.mdc` for e2e tests

### Env & logging usage

- **Environment variables**:
  - All env access must go through `@/lib/config/env`. Do **not** read `process.env` directly outside that module.
  - Prefer the exported grouped configs (e.g., `databaseEnv`, `neonEnv`, `stripeEnv`, `aiEnv`, `loggingEnv`) instead of raw keys.
  - If you need a new variable, add it (and its validation) to `src/lib/config/env.ts` rather than inlining a `process.env` read.
  - **CLERK_SESSION_TOKEN** (optional, for manual API testing only): Used by `scripts/test-plan-generation.sh` to authenticate curl requests. Not required for normal development—only for testing API endpoints directly without the UI.
- **Logging**:
  - Use `@/lib/logging/logger` for structured logging; avoid `console.*` in application code.
  - For API routes, use helpers from `@/lib/logging/request-context` to obtain `{ requestId, logger }` and to attach the request ID to responses.
  - If you think you need a direct `console.*` call, consider updating the centralized logging utilities instead.

### Dealing with specific github issues or tasks

- When working on a specific github issue or task, make sure to ALWAYS refer to the specific instructions, requirements, and testing needs defined in the issue or task description. Do not make any assumptions or add any extra features that are not explicitly requested.
- If the issue or task references any specific files, make sure to read those files carefully and understand their purpose before making any changes.
- If the issue or task has any dependencies on other issues or tasks, make sure to address those dependencies first before proceeding with the current task.
- If the issue or task references any documentation, designs, or other resources, make sure to review those materials thoroughly to ensure your implementation aligns with the intended goals.
- If the issue has subtasks or related issues, make sure to consider their requirements and testing needs as well.
- When you are done with the implementation, make sure to go back over the issue, task, and any related subtasks to ensure that all requirements have been met and all tests have been covered. When they have been met, make sure to mark the issue, subissue, or task as complete.

### Commit guidelines

- Only follow the commit message guidelines below if we have made changes to the codebase. If we have made changes to the documentation, testing, or other non-code files, DO NOT follow these guidelines.
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
  - pnpm dev:stripe (Stripe webhook listener for local testing)
- Manual API testing (manual plan generation without UI)
  - pnpm test-plan-generation (stream generate a plan with default settings)
  - ./scripts/test-plan-generation.sh stream --topic "Your topic" (custom topic)
  - ./scripts/test-plan-generation.sh list (list all plans for authenticated user)
  - ./scripts/test-plan-generation.sh status --plan-id UUID (check generation status)
  - Requires CLERK_SESSION_TOKEN in .env.local (see "Manual API testing" section below)
- Build (do not auto-run; listed for reference)
  - pnpm build
- Start production server (do not auto-run; listed for reference)
  - pnpm start
- Local CI simulation (mirrors GitHub Actions workflows)
  - pnpm local-ci:pr - Mirrors PR CI jobs: lint, type-check, build, unit tests (sharded 1/2, 2/2), integration tests (light subset)
  - pnpm local-ci:main - Mirrors main branch CI jobs: lint, type-check, build (staging env), migration dry-run, integration tests (sharded 1/2, 2/2), e2e tests (sharded 1/2, 2/2)
- Lint (type-aware, flat config)
  - pnpm lint
  - pnpm lint:fix
- Format (Prettier; Tailwind class sorting enabled)
  - pnpm format
  - To format arbitrary files: pnpm exec prettier --write <path>
- Type check only
  - pnpm type-check
- Code quality checks (warnings only, do not block PRs)
  - pnpm check:duplication (detect copy-pasted code, threshold: 5%)
  - pnpm check:complexity (check file sizes >500 LOC)
  - pnpm check:quality (run both duplication and complexity checks)
- Database (Drizzle)
  - Generate migrations: pnpm db:generate
  - Apply migrations: pnpm db:migrate
  - Apply migrations to test DB: pnpm db:migrate:test-db
  - Push schema to DB: pnpm db:push
  - Push schema to test DB: pnpm db:push:test-db
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
    - src/lib/db/index.ts - Main entry point exporting RLS-enforced clients (default/secure)
    - src/lib/db/schema/ - Database schema definitions and RLS policies
    - src/lib/db/enums.ts - PostgreSQL enum definitions
    - src/lib/db/service-role.ts - Service-role Drizzle client (RLS bypassed; for tests and internal operations)
    - src/lib/db/rls.ts - RLS-enforced Drizzle client factory (for request handlers)
    - src/lib/db/runtime.ts - Runtime DB selector (getDb() returns RLS DB in requests, service-role elsewhere)
    - src/lib/db/queries/ - Modular query files (attempts.ts, modules.ts, plans.ts, resources.ts, schedules.ts, tasks.ts, users.ts, jobs.ts)
    - src/lib/db/seed.ts, src/lib/db/seed-cli.ts - Database seeding utilities
    - src/lib/db/usage.ts - Usage tracking queries
    - src/lib/db/migrations/ - Drizzle migrations output directory
  - AI/Streaming: src/lib/ai/ (provider-factory.ts, orchestrator.ts, streaming/)
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
  - Database: Drizzle ORM with postgres-js + Neon
    - Connection: src/lib/db/service-role.ts uses DATABASE_URL (store in .env.local or .env.test). For Neon, include `?sslmode=require`.
    - Schema: src/lib/db/schema (tables) + src/lib/db/enums.ts (PostgreSQL enums)
    - Queries: src/lib/db/queries/ (modular query files by entity)
    - Migrations: managed via drizzle-kit; out dir is src/lib/db/migrations/
    - RLS policies: Defined in schema using pgPolicy for Neon Row Level Security
  - **Database client usage rules (CRITICAL for security)**:
    - **Default import** (`@/lib/db`): RLS-enforced clients (secure, for request handlers)
    - **Request handlers (API routes, server actions)**: MUST use `getDb()` from `@/lib/db/runtime`. This returns an RLS-enforced client that respects tenant isolation.
    - **Tests**: Use `db` from `@/lib/db/service-role` for business logic tests (RLS bypassed intentionally). Use authenticated Neon clients for RLS policy tests.
    - **Transactional writes**: Functions like `atomicCheckAndInsertPlan` may use service-role DB for atomicity, but must validate all inputs are caller-scoped.
    - **ESLint enforcement**: Importing `@/lib/db/service-role` in request layers (`src/app/api/**`, `src/lib/api/**`, `src/lib/integrations/**`) is blocked by lint rules.
    - See `src/lib/db/service-role.ts` and `src/lib/db/rls.ts` for detailed usage documentation.
  - Payments: Stripe integration for subscription billing
  - AI providers: Vercel AI SDK and OpenRouter providers for learning plan generation
  - Plan generation: Synchronous streaming via `/api/v1/plans/stream` (replaces background workers)

## Database schema overview (MVP)

- Core entities and relationships
  - users 1—\* learning_plans, integration_tokens, notion_sync_state, google_calendar_sync_state, usage_metrics, ai_usage_events, job_queue, task_progress, task_calendar_events
  - learning_plans 1—\* modules, plan_schedules, plan_generations, generation_attempts, notion_sync_state, google_calendar_sync_state, job_queue
  - modules 1—\* tasks
  - tasks 1—\* task_resources, task_progress, task_calendar_events
  - task_resources — resources (many-to-many with ordering and notes)
  - Job queue schema (retained for regeneration and rate limiting)
  - Integration sync states for Notion exports and Google Calendar sync
  - Usage tracking and quotas (monthly metrics, AI API usage)
  - Stripe webhook event storage
- Enums (DB-level, defined in src/lib/db/enums.ts)
  - skill_level: beginner | intermediate | advanced
  - learning_style: reading | video | practice | mixed
  - resource_type: youtube | article | course | doc | other
  - progress_status: not_started | in_progress | completed
  - generation_status: generating | ready | failed
  - job_status: pending | processing | completed | failed
  - job_type: plan_generation | plan_regeneration
  - subscription_tier: free | starter | pro
  - subscription_status: active | canceled | past_due | trialing
  - integration_provider: notion | google_calendar
- Key constraints and design choices
  - UUID primary keys on all tables; users.id is the internal PK
  - users: clerk_user_id UNIQUE, email UNIQUE
  - FKs generally use ON DELETE CASCADE to avoid orphans
  - Stable ordering: unique(plan_id, order) on modules; unique(module_id, order) on tasks (order starts at 1)
  - CHECK non-negative integers where applicable: weekly_hours, estimated_minutes, duration_minutes, cost_cents, attempts, max_attempts
  - Timestamps: created_at default now(); maintain updated_at in app logic or triggers
  - Row Level Security (RLS) policies enforce tenant isolation with session variables
  - Public plan visibility allows anonymous read access to public learning plans
- Indexes (common query patterns)
  - learning_plans(user_id, is_quota_eligible, generation_status); composite indexes for efficient queries
  - modules(plan_id, order); tasks(module_id, order)
  - task_progress(user_id, task_id); resources(type); task_resources(task_id, resource_id)
  - plan_generations(plan_id); generation_attempts(plan_id, created_at)
  - job_queue(status, scheduled_for, priority); integration_tokens(user_id, provider)
  - usage_metrics(user_id, month); ai_usage_events(user_id, created_at)
  - sync states: notion_sync_state(plan_id), google_calendar_sync_state(plan_id)
- Code locations
  - Schema: src/lib/db/schema/tables/ (modular table definitions + RLS policies)
  - Enums: src/lib/db/enums.ts (PostgreSQL enum definitions)
  - Relations: src/lib/db/schema/relations.ts (Drizzle ORM relationships)
  - Queries: src/lib/db/queries/ (modular query files by entity)
  - Usage tracking: src/lib/db/usage.ts, src/lib/db/schema/tables/usage.ts
  - Seeding: src/lib/db/seed.ts, src/lib/db/seed-cli.ts
  - Migrations: src/lib/db/migrations/ (drizzle-kit output)
  - Drizzle configs: drizzle.config.ts (main), drizzle-test.config.ts (test env)
  - Database clients: src/lib/db/index.ts (RLS clients), src/lib/db/service-role.ts (bypass client)
- Implemented features
  - Stripe subscription billing with webhook handling
  - Streaming plan generation via `/api/v1/plans/stream`
  - Row Level Security (RLS) policies with Neon for multi-tenant isolation
  - Usage tracking and quotas (monthly limits, AI API usage monitoring)
  - Third-party integrations: Notion exports, Google Calendar sync
  - Public plan sharing with anonymous access
  - Plan scheduling and regeneration tracking
  - OAuth token management for integrations
- Future considerations
  - Topic search indexing (FTS/trigram) can be added later
  - Additional integrations (Google Docs, etc.) follow the same pattern
  - Plan templates and cloning features

## Testing

- **Primary reference**: See [docs/testing/testing.md](docs/testing/testing.md) for comprehensive testing documentation. Always update this file with testing-related changes.
- Framework: Vitest with @testing-library/react and @testing-library/jest-dom
- Test organization (tests/ directory):
  - tests/unit/ - Isolated component tests (AI providers, utilities, parsing, validation)
  - tests/integration/ - Multi-component tests (API contracts, concurrency, streaming generation, RLS)
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

## Manual API testing

For rapid iteration on plan generation without using the UI, use the `scripts/test-plan-generation.sh` helper script.

### Setup (one-time)

1. **Create a JWT template in Clerk Dashboard** for extended token lifetime:
   - Go to Clerk Dashboard → JWT Templates → New Template → Blank
   - Name it `testing` (or any name you prefer)
   - Set Token Lifetime to 3600 (1 hour) or longer for convenience
   - Leave claims as default `{}`

2. **Get your session token** from browser console while logged into your local app:

   ```javascript
   await window.Clerk.session.getToken({ template: 'testing' });
   ```

3. **Add the token to `.env.local`**:
   ```
   CLERK_SESSION_TOKEN=eyJhbGciOi...
   ```

### Usage

```bash
# Stream generate a plan with defaults (recommended for most testing)
./scripts/test-plan-generation.sh

# Custom topic and settings
./scripts/test-plan-generation.sh stream --topic "Learn React hooks" --skill intermediate --hours 8

# List all your plans
./scripts/test-plan-generation.sh list

# Check a specific plan's generation status
./scripts/test-plan-generation.sh status --plan-id "your-plan-uuid"

# See all available options
./scripts/test-plan-generation.sh --help
```

### Available options

| Option      | Values                                  | Default                         |
| ----------- | --------------------------------------- | ------------------------------- |
| `--topic`   | Any string (3-200 chars)                | "Learn TypeScript fundamentals" |
| `--skill`   | `beginner`, `intermediate`, `advanced`  | `beginner`                      |
| `--hours`   | 0-80                                    | 10                              |
| `--style`   | `reading`, `video`, `practice`, `mixed` | `mixed`                         |
| `--notes`   | Any string (max 2000 chars)             | none                            |
| `--plan-id` | UUID (required for `status` command)    | none                            |

### API endpoints tested

- `POST /api/v1/plans/stream` - Stream generates a complete learning plan with AI
- `POST /api/v1/plans` - Creates a plan record only (no AI generation)
- `GET /api/v1/plans` - Lists all plans for the authenticated user
- `GET /api/v1/plans/:planId/status` - Returns generation status for a specific plan
