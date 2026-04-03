# Playwright Local Smoke Testing — Implementation Plan

> **Goal:** Build a committed local smoke-test workflow that is safe, rerunnable, and production-adjacent without mutating `.env.local`, with Playwright-managed Chromium, and without depending on the long-lived local dev database.
> **Research references:** [phase1-research.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/phase1-research.md), [phase2-research.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/phase2-research.md), [phase3-research.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/phase3-research.md)

## Context

The earlier smoke direction was wrong for this codebase. It relied on `.env.local` mutation, mixed tool choices, and assumed shared local DB state was acceptable. That would have created a brittle harness with hidden machine-specific failures.

The direction now locked for this PRD is:

- Playwright is the only committed browser smoke runner
- Playwright-managed Chromium is the browser binary
- Pattern A orchestration is the source of truth:
  - `scripts/smoke/run.ts` owns the ephemeral Testcontainers database lifecycle
  - Playwright owns browser execution and app-server startup
  - mode-specific launcher scripts own anon/auth process env
- `.env.local` is never edited, rewritten, or used as a smoke-mode toggle
- one ephemeral Postgres container is created per full smoke invocation
- two app servers run on separate ports with isolated mode ownership
- auth coverage remains serial, and the current local runner keeps the full suite serial for machine-stability and resource reasons

Repo-specific feasibility already proved during research:

- process-start env injection is sufficient in this codebase to separate anon and auth modes without touching `.env.local`
- anon mode correctly returns `307` to `/auth/sign-in` for protected routes
- auth mode correctly loads `/dashboard` and `/pricing` with the seeded local product-testing user

## Locked Constraints

- Do not mutate `.env.local`
- Do not introduce Puppeteer, Playwright-managed Chromium is the browser runtime
- Do not add app-level smoke flags unless process env precedence fails during implementation
- Do not let each Playwright project create or own its own database container
- Do not run auth smoke with parallel workers against shared mutable user state
- Keep browser smoke local-first, but design the command surface so CI adoption is straightforward later

## Strategy

The work should land in three grouped phases:

1. Runtime foundation
   - establish a disposable smoke runtime around one ephemeral Postgres container per invocation
   - add explicit anon/auth launcher scripts that inject mode env at process start
2. Runner and core coverage
   - replace the dead Vitest smoke lane with a real Playwright project setup
   - add launch-blocker smoke coverage first
3. Expanded local flows and finalization
   - finish the remaining local-safe flows
   - clean up docs, command surface, and verification evidence

This plan deliberately separates responsibilities:

- DB lifecycle belongs to the outer smoke wrapper
- mode control belongs to launcher scripts
- browser execution belongs to Playwright
- route redirect verification belongs to Playwright request-based checks
- interactive user flows belong to Playwright page-based checks

## Phase 1 — Runtime Foundation

### Step 1.0 — Confirm acceptance criteria and runtime contract

- Lock the smoke contract in this PRD before implementation begins:
  - one disposable Postgres container per `pnpm test:smoke` run
  - temp smoke state stored outside repo state
  - two app servers consume the same disposable DB
  - `.env.local` remains untouched
- Confirm the seeded local product-testing user and local billing/AI mock prerequisites required for auth smoke

### Steps 1.1–1.N — Implement the outer smoke wrapper

- Add `scripts/smoke/run.ts` as the top-level smoke owner
- Reuse existing DB bootstrap helpers instead of the long-lived dev DB bootstrap path
- Start one Postgres Testcontainer for the full run
- Apply migrations and required grants
- Seed the local product-testing user needed for auth smoke
- Write DB connection metadata to an OS temp file outside the repo
- Spawn Playwright with a pointer to that temp state
- Guarantee teardown in `finally` so failed runs do not leak containers or temp files

### Validation Steps

- Run the wrapper in an infra-only or minimal smoke mode to prove DB creation and teardown
- Verify the temp state file is created outside the repo and removed on teardown
- Verify the seeded smoke user exists in the ephemeral DB

### Verification and Closure

- Walk each Phase 1 acceptance criterion with concrete commands and observed results in [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
- Do not move on until disposable DB setup is repeatable across reruns

### Step 2.0 — Confirm anon/auth mode requirements

- Lock the mode maps before implementation:
  - anon mode must force `DEV_AUTH_USER_ID=''` and `LOCAL_PRODUCT_TESTING=false`
  - auth mode must force the seeded local user id plus billing, AI, and AV local-test env
- Confirm the ports and `APP_URL` values the two Playwright projects will use

### Steps 2.1–2.N — Implement launcher-owned mode control

- Add `scripts/smoke/start-app.ts --mode=anon|auth`
- Add a readable mode-config module so env differences are obvious at a glance
- Read the temp DB state generated by the outer wrapper
- Merge DB env with mode-specific env and inherited process env
- Let the launcher-owned mode config also set a dedicated Next dist dir per server so concurrent `next dev` processes do not fight over the default `.next` lock
- Keep the app server on `next dev` development runtime; do not force `NODE_ENV=test` for the browser app processes
- Spawn `next dev --turbopack` on the assigned port
- Keep anon and auth startup completely separate so mode state cannot leak between them

### Validation Steps

- Start anon and auth launchers independently against the ephemeral DB
- Verify protected anon routes redirect to `/auth/sign-in`
- Verify auth mode loads `/dashboard` and `/pricing` cleanly
- Verify `.env.local` was not modified and is irrelevant to smoke-mode selection

### Verification and Closure

- Record the exact startup commands and observed HTTP/browser outcomes in [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
- Treat any need for `.env.local` mutation as a failure of this phase

## Phase 2 — Runner and Core Coverage

### Step 3.0 — Confirm the committed smoke toolchain

- Retire the idea of Vitest browser smoke for this workflow
- Lock Playwright-managed Chromium as the browser runtime
- Lock two Playwright projects:
  - `smoke-anon`
  - `smoke-auth`

### Steps 3.1–3.N — Add Playwright as the committed smoke runner

- Add Playwright dependencies and scripts
- Create `playwright.config.ts`
- Configure the two smoke projects with separate ports and base URLs
- Let Playwright start both app servers through project-specific launcher commands
- Allow the two local smoke origins in Next dev config so two-port Playwright smoke can load `/_next/*` assets without cross-origin blocking
- Keep Phase 2 auth coverage in one serial auth spec file so billing state cannot reorder earlier assertions
- Remove or deprecate the empty Vitest smoke lane so `pnpm test:smoke` has one meaning
- Ignore Playwright artifacts and update only the runner-ownership docs in this phase
- Do not keep temporary launcher/infra helper scripts once the committed Playwright runner owns the real workflow

### Validation Steps

- Run a minimal two-project Playwright smoke check
- Verify both app servers start against the same ephemeral DB
- Verify the anon and auth projects remain isolated by mode and port, even though the local runner currently executes the full suite serially

### Verification and Closure

- Document the final command surface and output locations in [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
- Do not proceed to full flow coverage until the runner itself is stable

### Step 4.0 — Confirm must-pass local smoke scope

- Lock the first committed smoke scope to launch-blocker paths:
  - anon protected-route redirects
  - auth dashboard, plans, and `/plans/new`
  - manual plan creation
  - plan detail and module navigation
  - pricing to local checkout to billing to portal
- Confirm redirect assertions will use Playwright request-based checks, not browser-followed redirects
- Confirm manual smoke inputs are deterministic for the seeded free-tier user instead of relying on UI defaults that exceed the free-tier cap
- Lock the exact Phase 2 Playwright file layout:
  - `tests/playwright/smoke/anon.redirects.spec.ts`
  - `tests/playwright/smoke/auth.launch-blockers.spec.ts`
  - `tests/playwright/smoke/fixtures.ts`
- Add one targeted regression test before browser work:
  - `tests/unit/app/pricing/page.spec.tsx`
  - pin `src/app/pricing/page.tsx` to the current `withServerComponentContext` auth path

### Steps 4.1–4.N — Implement the smoke specs

- Add anon request-based redirect coverage for these exact routes:
  - `/dashboard`
  - `/plans`
  - `/plans/new`
  - `/settings/profile`
  - `/settings/billing`
  - `/settings/ai`
  - `/settings/integrations`
  - `/settings/notifications`
  - `/analytics`
  - `/analytics/usage`
  - `/analytics/achievements`
- Assert `307` and `Location` containing `/auth/sign-in` for every anon redirect check
- Do not include `/api/*` browser smoke coverage in Phase 2
- Implement one serial auth spec file covering this exact order:
  - `/dashboard`
  - `/plans`
  - `/plans/new`
  - manual plan creation with deterministic free-tier-safe inputs:
    - topic `Learn Rust`
    - skill level `Advanced`
    - weekly hours `11-15 hours`
    - learning style `Reading`
    - deadline `2 weeks`
  - wait for redirect to `/plans/{id}`
  - plan detail load
  - open first available module from the generated plan
  - module detail load
  - click `aria-label="Next module"` when present and verify module-to-module navigation
  - navigate back to the plan using breadcrumb/header navigation, not browser-history assumptions
  - visit `/analytics` and assert final URL `/analytics/usage`
  - visit `/pricing`
  - launch starter checkout from the monthly starter CTA
  - complete local checkout
  - assert redirect to `/settings/billing`
  - assert subscribed billing state
  - click `Manage Subscription`
  - assert local portal returns to `/settings/billing?local_portal=1`
- Use stable visible labels and existing aria labels from the current UI; do not rely on seeded existing plans

### Validation Steps

- Run the launch-blocker smoke suite locally through `pnpm test:smoke`
- Verify anon coverage reports correct `307` and `Location` behavior
- Verify auth coverage completes end-to-end against the ephemeral DB

### Verification and Closure

- Record exact flow-by-flow outcomes in [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
- Any skipped or deferred flow must be documented immediately with a reason

## Phase 3 — Expanded Local Flows and Finalization

### Step 5.0 — Confirm remaining scope and residual risks

- Lock the remaining local-safe flows for this PRD:
  - PDF upload and generation
  - settings saves
  - load-only checks for remaining settings surfaces
  - docs finalization for the Playwright-owned workflow
  - reproduce-first handling for the old `/plans` accessibility warning

### Steps 5.1–5.N — Finish the local smoke workflow

- Add `tests/playwright/smoke/auth.pdf-settings.spec.ts` for:
  - invalid PDF upload rejection
  - valid PDF upload, preview, free-tier-safe deadline override, generation, and first-module open
  - `/settings/profile` save + reload verification
  - `/settings/ai` save + reload verification
  - load-only checks for `/settings/integrations` and `/settings/notifications`
- Add `tests/playwright/smoke/helpers/pdf-fixture.ts` so PDF upload uses a generated temp file instead of a checked-in binary fixture
- Keep Phase 3 auth coverage independent of the Phase 2 billing upgrade; the new spec must pass even if it runs before the billing spec
- Update docs so [playwright-local-smoke.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/playwright-local-smoke.md) becomes the canonical smoke doc and [browser-smoke-testing.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md) becomes historical-only guidance
- Reproduce the old `/plans` warning before touching product code; if it no longer reproduces, document closure instead of inventing a fix
- Update the PRD artifacts with actual verification evidence, deviations, and lessons learned
- Keep the local Playwright runner serial (`workers: 1`) until machine-resource headroom and stability justify re-enabling project-level parallelism

### Validation Steps

- Run `pnpm test:smoke`
- Run `pnpm test:changed`
- Run `pnpm lint`
- Run `pnpm type-check`

### Verification and Closure

- Walk through every acceptance criterion in [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md) with concrete commands and observed outcomes
- Add a review section summarizing what passed, what was fixed, and what remains intentionally out of scope

## Must-Pass Scope

The committed local smoke workflow is not done until all of the following are true:

- `pnpm test:smoke` creates and destroys one ephemeral DB per run
- anon and auth app servers start through launcher scripts on separate ports
- `.env.local` is never modified as part of smoke setup
- Playwright-managed Chromium runs the smoke suite locally
- anon redirect coverage proves protected routes return the expected redirect behavior
- auth coverage proves the launch-blocker product flows work end-to-end
- auth smoke remains serial, and the current local runner executes the overall suite serially for stability
- stale Vitest smoke ownership is removed or clearly deprecated

## Open Risks to Watch During Implementation

- env precedence failures at Next startup would invalidate the launcher strategy
- auth-flow ordering mistakes can corrupt billing-dependent assertions
- over-broad selector changes can increase blast radius unnecessarily
- DB bootstrap shortcuts that depend on `.env.local` would reintroduce machine-specific behavior
- leaving old smoke documentation in place would create toolchain ambiguity again
