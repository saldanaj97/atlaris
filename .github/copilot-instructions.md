# Atlaris Copilot Instructions

Read `docs/agent-context/learnings.md` whenever you rely on this file. That file is the durable correction log for repo-specific pitfalls and preferences.

## Planning artifacts

- Use `.plans/` for active PRDs, todos, plans, and review notes.
- For non-trivial work, create or update `.plans/<task>/todos.md` and `.plans/<task>/plan.md`.
- If the user asks for a plan, audit, handoff prompt, ordering recommendation, or other planning-only artifact, stay in that mode. Do not start implementing code, create extra artifacts, or expand the scope until the user asks.
- Do not edit attached or read-only plan files (for example `.cursor/plans/**`) unless the user explicitly asks. Track progress in `.plans/.../todos.md`, plan frontmatter todos, or existing todo items instead.
- If the user explicitly asks you to edit a plan file, update that exact file in place. Preserve the existing section structure, replace stale content inline, and do not append new sections or companion docs unless requested.
- If a plan or issue specifies a commit order or split, preserve that order.
- If the user says not to push yet, keep commits local.

## Commands

```bash
pnpm dev
pnpm dev:full
pnpm build
pnpm check:lint
pnpm check:type
pnpm check:full

pnpm test                # same as pnpm test:changed
pnpm test:changed
pnpm test:unit:changed
pnpm test:integration:changed
pnpm exec tsx scripts/tests/run.ts unit tests/unit/path/to/file.spec.ts
pnpm exec tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts
pnpm test:security       # Docker / Testcontainers required
pnpm test:smoke          # Playwright smoke entrypoint
pnpm db:dev:start
pnpm db:dev:stop
pnpm db:dev:reset
```

- Prefer scoped, changed-only, or single-file test commands over the full suite.
- `pnpm test` is intentionally lightweight in this repo; do not assume it runs everything.
- `pnpm dev` uses whatever database URLs are already configured. For the supported local Postgres workflow, use `pnpm dev:full` or the `pnpm db:dev:*` commands instead of improvising your own setup.
- `pnpm test:smoke` is the supported browser-smoke entrypoint. Do not start smoke app servers manually for normal runs.
- Integration and security tests rely on Testcontainers. If Docker is not running, call that out early instead of retrying blindly.

## High-level architecture

- Route protection lives in `src/proxy.ts`, not a root `middleware.ts`.
- API routes use `withAuth` or `requestBoundary.route` (`src/lib/api/auth.ts`, `src/lib/api/request-boundary.ts`). For server components and server actions, prefer `requestBoundary.component` / `requestBoundary.action` over calling `withServerComponentContext` / `withServerActionContext` directly (those are compat shims).
- Request handlers must use `getDb()` from `src/lib/db/runtime.ts` for request-scoped RLS access.
- Service-role DB clients are for tests, workers, migrations, and other system flows only. Do not import them into normal request handlers.
- Plan generation starts at `POST /api/v1/plans/stream`. The stream route creates the plan record, runs generation, persists attempts/modules/tasks, and emits SSE progress events. Core orchestration lives in `src/lib/ai/orchestrator.ts`, with persistence in `src/lib/db/queries/plans.ts` and `src/lib/db/queries/attempts.ts`.

## Key conventions

- For authenticated server components and server actions, prefer `requestBoundary.component()` / `requestBoundary.action()`. The older `withServerComponentContext` / `withServerActionContext` are compatibility shims. Use `getEffectiveAuthUserId()` only for redirect-only identity checks (no RLS `getDb()` in that path). Do not introduce new `getCurrentUserRecordSafe()` usage.
- Do not edit `.env.local` unless the user explicitly asks. Treat it as user-owned machine state; prefer shared docs/examples and launcher-owned env for local smoke or dev-db work.
- In tests, prefer `@tests/...` aliases for test-only helpers, mocks, and fixtures.
- `vi.mock()` and `importActual()` must use the exact same module specifier string as the production import. Relative-path equivalents can register as different module IDs and miss the dependency under test.
- When a test depends on mock-before-import ordering, preserve that order even if it requires a targeted `biome-ignore` to stop import reordering.
- If you are changing tests, read `tests/AGENTS.md` for repo-specific test patterns and supported entrypoints.
- Before applying Fleet, CodeRabbit, or other review-bot findings, verify each item against the current tree and the active plan scope. Skip stale, invalid, or explicitly excluded findings instead of implementing them mechanically.
- Before staging, committing, or pushing, inspect the working tree and stage only files that belong to the current workstream. Mixed `.plans/`, docs, or unrelated pending changes are common here; exclude them unless the user explicitly includes them.
