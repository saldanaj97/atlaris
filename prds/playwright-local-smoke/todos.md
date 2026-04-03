# Playwright Local Smoke Testing — Todos

## Notes

- This PRD replaces the old local smoke direction that depended on `.env.local` mutation and mixed browser tool choices.
- Playwright is the only committed browser smoke runner for this workflow.
- Playwright-managed Chromium is the browser runtime.
- Pattern A orchestration is locked:
  - `scripts/smoke/run.ts` owns the disposable Testcontainers DB lifecycle
  - Playwright owns browser execution and app-server startup
  - launcher scripts own anon/auth process env
- One ephemeral Postgres container is created per full smoke invocation, not per project.
- `.env.local` must remain untouched throughout smoke setup and execution.
- Auth smoke stays serial, and the current local runner keeps the full suite serial because project-level parallel execution was not stable enough on a busy developer machine.
- The seeded local smoke user starts as free tier, so browser specs must use free-tier-compatible inputs unless a spec explicitly upgrades the user first and documents that dependency.

## Execution Order Summary

```text
Phase 1:
  1. Smoke runtime and ephemeral DB lifecycle
  2. Mode-specific app launchers

Phase 2:
  3. Playwright runner and project architecture
  4. Launch-blocker smoke coverage

Phase 3:
  5. Remaining local flows, docs, and final hardening
```

---

## Phase 1: Runtime Foundation

### 1. Smoke Runtime and Ephemeral DB Lifecycle

- **Blocked by:** None
- **Parallel candidate:** No

**Summary:** Build the outer smoke wrapper that owns one disposable Postgres container per smoke invocation and passes the resolved DB state forward without touching `.env.local`.

**Acceptance criteria:**

- [x] A top-level smoke wrapper creates exactly one ephemeral Postgres container per `pnpm test:smoke` run
- [x] Migrations, required grants, and seeded local product-testing data are applied to the ephemeral DB
- [x] DB connection metadata is written to temporary state outside the repo
- [x] The disposable DB and temporary state are always torn down in `finally`
- [x] The long-lived local dev DB path is not required for browser smoke runs

---

### 2. Mode-Specific App Launchers

- **Blocked by:** Smoke Runtime and Ephemeral DB Lifecycle
- **Parallel candidate:** No

**Summary:** Start anon and auth app servers through explicit launcher-owned env maps so the smoke suite can switch modes without rewriting local files.

**Acceptance criteria:**

- [x] `anon` mode injects `DEV_AUTH_USER_ID=''`, `LOCAL_PRODUCT_TESTING=false`, `APP_URL`, `PORT`, and ephemeral DB env
- [x] `auth` mode injects the seeded local auth user id, `LOCAL_PRODUCT_TESTING=true`, billing/AI/AV local-test env, `APP_URL`, `PORT`, and ephemeral DB env
- [x] Anon and auth servers can be started independently on separate ports against the same ephemeral DB
- [x] Browser app servers stay on development runtime so proxy and local-product-testing bypass logic behave like real local usage
- [x] Protected anon routes redirect correctly while auth routes load correctly under the seeded smoke user
- [x] `.env.local` remains untouched and is not part of mode selection

---

## Phase 2: Runner and Core Coverage

### 3. Playwright Runner and Project Architecture

- **Blocked by:** Smoke Runtime and Ephemeral DB Lifecycle, Mode-Specific App Launchers
- **Parallel candidate:** Partial

**Summary:** Make Playwright the one committed smoke runner with two projects, shared disposable DB state, and project-specific app-server startup.

**Acceptance criteria:**

- [x] `@playwright/test` is installed as a direct dependency and Playwright-managed Chromium is the browser runtime
- [x] `pnpm test:smoke` runs Playwright, not Vitest browser smoke
- [x] Two Playwright projects exist: `smoke-anon` and `smoke-auth`
- [x] Playwright starts two app servers on separate ports through launcher commands
- [x] The runner keeps anon and auth mode ownership separate, while current local execution stays serial and Phase 2 auth coverage remains in one serial auth spec file
- [x] Playwright artifacts are handled explicitly and stale Vitest smoke ownership is removed or clearly deprecated
- [x] The smoke architecture keeps only executable entrypoints in `scripts/smoke/`, with shared runtime modules under `tests/helpers/smoke/`
- [x] Concurrent local `next dev` smoke servers use separate smoke-only dist dirs and an explicit Next dev origin allowlist so two-port Playwright runs do not fight over `.next` or block `/_next/*` assets

---

### 4. Launch-Blocker Smoke Coverage

- **Blocked by:** Playwright Runner and Project Architecture
- **Parallel candidate:** Partial

**Summary:** Cover the product flows that actually matter for local release confidence before expanding into lower-priority smoke coverage.

**Acceptance criteria:**

- [x] `tests/unit/app/pricing/page.spec.tsx` pins the authenticated pricing page to the current `withServerComponentContext` auth path
- [x] `tests/playwright/smoke/anon.redirects.spec.ts` uses Playwright request-based assertions and verifies `307` plus `Location` containing `/auth/sign-in` for:
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
- [x] `tests/playwright/smoke/auth.launch-blockers.spec.ts` is the only Phase 2 auth spec file and runs serially
- [x] Auth smoke covers dashboard, plans, `/plans/new`, manual plan creation, resulting plan detail, module detail, next-module navigation, breadcrumb/header return to the plan, `/analytics` redirect, pricing, local checkout, billing, and portal entry
- [x] Manual plan smoke uses deterministic free-tier-safe inputs: topic `Learn Rust`, skill level `Advanced`, weekly hours `11-15 hours`, learning style `Reading`, deadline `2 weeks`
- [x] Auth flow ordering is deterministic so billing state does not invalidate earlier assertions
- [x] The authenticated `/pricing` regression is pinned so the auth-path bug cannot silently return

---

## Phase 3: Expanded Local Flows and Finalization

### 5. Remaining Local Flows, Docs, and Final Hardening

- **Blocked by:** Launch-Blocker Smoke Coverage
- **Parallel candidate:** Yes

**Summary:** Finish the local-safe coverage, clean up docs, and make the smoke workflow understandable enough that it does not regress into tribal knowledge.

**Acceptance criteria:**

- [x] PDF upload and generation smoke coverage exists against the disposable DB flow
- [x] PDF smoke uses deterministic inputs compatible with the current seeded tier and explicitly overrides the PDF default deadline to `2 weeks`
- [x] Settings pages with real persistence are covered by smoke tests: `/settings/profile` and `/settings/ai`
- [x] Load-only checks exist where persistence is not part of the product contract: `/settings/integrations` and `/settings/notifications`
- [x] Docs and test guidance point to Playwright and the new smoke workflow instead of stale browser-smoke assumptions
- [x] The old `/plans` accessibility warning is documented as no longer reproducible on the current tree
- [x] Final verification records the exact commands run, the observed results, and any remaining out-of-scope gaps

---

## Review

**Implementation notes:** Phase 1 runtime foundation landed 2026-04-02. The executable smoke entrypoints live in `scripts/smoke/`: `run.ts` (outer wrapper with `finally` teardown) and `start-app.ts` (`pnpm exec next dev --turbopack`). Shared smoke runtime modules live in `tests/helpers/smoke/`: `state-file.ts` (temp JSON state + `SMOKE_STATE_FILE`), `postgres-container.ts`, `db-pipeline.ts` (bootstrap + migrate + grant + `seedLocalProductTestingUser`), `mode-config.ts` (ports `3100`/`3101`, anon/auth env maps), and `verify-seed.ts`. Package script: `test:smoke`. Low-level debug entrypoints remain direct `tsx` invocations, not package scripts: `scripts/smoke/run.ts --smoke-step=db` and `scripts/smoke/start-app.ts --mode=...`. Unit tests: `tests/unit/helpers/smoke/state-file.spec.ts`, `mode-config.spec.ts`. Smoke state intentionally omits `ALLOW_DB_TRUNCATE` (Vitest-only).

**Verification commands:**

- `pnpm exec vitest run --project unit tests/unit/helpers/smoke/`
- `pnpm exec tsx scripts/smoke/run.ts --smoke-step=db` (Docker + disposable DB + seed assertion + teardown)
- `pnpm type-check`

**Observed results:** All commands above succeeded locally on 2026-04-02. `pnpm test:smoke` runs disposable DB lifecycle and exits with Phase 2 placeholder message after seed verification.

**Deviations from plan:** None during the original implementation. The later cleanup removed the temporary launcher guardrail helper after it outlived its value.

**Implementation notes:** Phase 2 runner and core coverage landed 2026-04-02. Added [playwright.config.ts](/Users/juansaldana/Dev/Projects/atlaris/playwright.config.ts) with `smoke-anon` and `smoke-auth` projects, replaced the Vitest smoke lane in [vitest.config.ts](/Users/juansaldana/Dev/Projects/atlaris/vitest.config.ts), updated [scripts/smoke/run.ts](/Users/juansaldana/Dev/Projects/atlaris/scripts/smoke/run.ts) to invoke Playwright after disposable DB prep, and added [tests/playwright/smoke/anon.redirects.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/playwright/smoke/anon.redirects.spec.ts), [tests/playwright/smoke/auth.launch-blockers.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/playwright/smoke/auth.launch-blockers.spec.ts), and [tests/unit/app/pricing/page.spec.tsx](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/pricing/page.spec.tsx). Parallel local `next dev` required two implementation details the original Phase 2 draft had not called out explicitly: launcher-owned `SMOKE_NEXT_DIST_DIR` values (`.next-smoke-anon` and `.next-smoke-auth`) to avoid the default `.next` lock, and `allowedDevOrigins` in [next.config.ts](/Users/juansaldana/Dev/Projects/atlaris/next.config.ts) for `127.0.0.1` and `localhost` so the two-port Playwright setup could load `/_next/*` assets without dev-time cross-origin blocking.

**Verification commands:**

- `pnpm exec vitest run --project unit tests/unit/app/pricing/page.spec.tsx tests/unit/helpers/smoke/`
- `pnpm type-check`
- `pnpm test:smoke -- --project smoke-anon`
- `pnpm test:smoke -- --project smoke-auth`
- `pnpm test:smoke`
- `pnpm test:changed`

**Observed results:** All commands above succeeded locally on 2026-04-02. `pnpm test:smoke` now boots one disposable Postgres container, starts both Playwright-owned app servers on ports `3100` and `3101`, runs 12 smoke tests cleanly, and tears everything down successfully.

**Deviations from plan:** No scope deviation. The implementation surfaced two previously implicit requirements for stable two-port local smoke: isolated Next build output per server and an explicit Next dev origin allowlist for the two smoke ports. Later stabilization also kept the local runner globally serial (`workers: 1`) because project-level parallel execution was not reliable enough on a resource-constrained machine. The PRD source-of-truth files were updated to capture all three requirements.

**Implementation notes:** Phase 3 expanded the committed smoke lane on 2026-04-02. Added [tests/playwright/smoke/auth.pdf-settings.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/playwright/smoke/auth.pdf-settings.spec.ts) for invalid PDF rejection, valid PDF upload/generation, settings persistence, and load-only settings checks; added [tests/playwright/smoke/helpers/pdf-fixture.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/playwright/smoke/helpers/pdf-fixture.ts) to generate temporary valid and invalid upload files; hardened [tests/playwright/smoke/fixtures.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/playwright/smoke/fixtures.ts) so generated-plan waits poll the empty-state page cleanly instead of failing with a fake 1ms visibility assertion; and finalized docs in [docs/testing/playwright-local-smoke.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/playwright-local-smoke.md) plus [docs/testing/browser-smoke-testing.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md). No product-code change was made for the old `/plans` accessibility warning because the current tree already exposes an accessible search label and the warning was not reproducible during Phase 3 verification.

**Verification commands:**

- `pnpm type-check`
- `pnpm test:changed`
- `pnpm test:smoke -- --project smoke-auth`
- `pnpm test:smoke`

**Observed results:** All commands above succeeded locally on 2026-04-02. `pnpm test:smoke` now runs 15 Playwright smoke tests against one disposable Postgres container, with the full suite executing serially via `workers: 1` for local stability. PDF upload/generation, profile persistence, AI preference persistence, integrations load, and notifications load all passed. The old `/plans` accessibility warning was not reproduced on the current tree, so it was closed by documentation instead of speculative product churn.

**Deviations from plan:** The final local runner stays globally serial instead of running anon/auth projects concurrently. That is deliberate, not accidental: parallel two-project execution was more fragile on a busy local machine, and a serial runner is better than a theoretically faster but less trustworthy one.
