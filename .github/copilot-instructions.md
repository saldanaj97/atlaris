This file provides guidance to copilot when working with code in this repository.

Repository overview

- Framework: Next.js 15 (TypeScript, React 19) using Turbopack for dev/build
- Package manager: pnpm (pnpm-lock.yaml present)
- Styling: Tailwind CSS v4 (config-less), with prettier-plugin-tailwindcss
- Linting: ESLint flat config (eslint.config.mjs) with type-aware rules and import-x
- Formatting: Prettier (.prettierrc, .prettierignore)
- Type checking: tsc --noEmit
- Notable deps: @clerk/nextjs, @supabase/supabase-js, @supabase/ssr, drizzle-orm, drizzle-kit, postgres, dotenv

Assistant/Copilot rules in-repo

- There are rules defined under .cursor/rules. Review them when generating or refactoring code (topics include Next.js, React, and Tailwind). Use them as guidance; do not duplicate them here.

Common commands

- Dev server (do not auto-run; listed for reference)
  - pnpm dev
- Build (do not auto-run; listed for reference)
  - pnpm build
- Start production server (do not auto-run; listed for reference)
  - pnpm start
- Lint (type-aware, flat config)
  - pnpm lint
  - pnpm lint:fix
- Format (Prettier; Tailwind class sorting enabled)
  - pnpm format
  - To format arbitrary files (including non-src files like this WARP.md): pnpm exec prettier --write <path>
- Type check only
  - pnpm type-check
- Database (Drizzle)
  - Generate migrations from schema: pnpm exec drizzle-kit generate
  - Apply migrations: pnpm exec drizzle-kit push
- Tests
  - No test runner or test scripts are currently configured in package.json. As of now, there is no single-test command.

Project structure and architecture

- Source layout
  - TypeScript path alias @/_-> src/_ (tsconfig.json)
  - ESLint targets src/**/\* and references Next.js App Router conventions (e.g., src/app/**/route.ts). The intended source root is src/, with Next.js app/ under src/app/.
  - src/app/ exists (e.g., src/app/page.tsx).
  - Database code: src/lib/db/schema.ts, src/lib/db/drizzle.ts, src/lib/db/queries.ts.
  - Drizzle migrations output directory: src/lib/db/migrations.

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
  - @clerk/nextjs and @supabase/supabase-js/@supabase/ssr are present.
  - Database: Drizzle ORM with postgres-js is configured.
    - Connection: src/lib/db/drizzle.ts uses DATABASE_URL (store in .env.local). For Supabase, include `?sslmode=require`.
    - Schema: src/lib/db/schema.ts
    - Queries: src/lib/db/queries.ts
  - Migrations: managed via drizzle-kit; out dir is src/lib/db/migrations.

Database schema overview (MVP)

- Core entities and relationships
  - users 1—* learning_plans
  - learning_plans 1—* modules
  - modules 1—* tasks
  - tasks — resources via task_resources (ordered per task)
  - users — tasks via task_progress (per-user status; derive module/plan completion)
  - learning_plans 1—* plan_generations (regeneration history)
- Enums (DB-level)
  - skill_level: beginner | intermediate | advanced
  - learning_style: reading | video | practice | mixed
  - resource_type: youtube | article | course | doc | other
  - progress_status: not_started | in_progress | completed
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
  - Schema: src/lib/db/schema.ts
  - Queries: src/lib/db/queries.ts
  - Migrations: src/lib/db/migrations (drizzle-kit)
- Future considerations
  - Topic search indexing can be added later
  - Billing tables arrive with Stripe integration; exports/integrations (Notion/Google) are out of scope for MVP

Notes for future tasks

- Prefer pnpm for all commands in this repo.
- When adding tests, introduce a runner (e.g., Vitest or Jest) and corresponding scripts in package.json (e.g., test, test:watch). Until then, test commands are intentionally omitted.
