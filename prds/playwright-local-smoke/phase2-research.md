# Phase 2: Runner and Core Coverage — Research & Implementation Plans

> **Parent PRD:** [plan.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/plan.md)
> **Execution tracker:** [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
> **Prerequisite:** [phase1-research.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/phase1-research.md)
> **Research date:** 2026-04-02
> **Status:** Research complete — ready for implementation after Phase 1 lands

---

## Slice 3: Playwright Runner and Project Architecture

### 1. Current State

There is no committed Playwright setup in the repo today:

- [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L34) has no direct `@playwright/test` dependency and no Playwright scripts.
- [vitest.config.ts](/Users/juansaldana/Dev/Projects/atlaris/vitest.config.ts#L54) still defines a `smoke` Vitest project at [vitest.config.ts:57]( /Users/juansaldana/Dev/Projects/atlaris/vitest.config.ts#L57 ) targeting `tests/smoke/**/*.smoke.spec.{ts,tsx}`, but there are no committed smoke specs there.
- [tests/AGENTS.md](/Users/juansaldana/Dev/Projects/atlaris/tests/AGENTS.md#L45) still documents “Smoke” as sequential, no-DB, and owned by the tests module rather than a browser runner.
- [docs/testing/test-standards.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/test-standards.md#L251) correctly says true browser E2E is best done with Playwright, but it is guidance only; the repo has no matching implementation.
- [docs/testing/browser-smoke-testing.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md#L303) still frames automation as a future step after manual/MCP testing.
- [.gitignore](/Users/juansaldana/Dev/Projects/atlaris/.gitignore#L13) ignores `.testcontainers-env.json` but not Playwright outputs such as `playwright-report/` or `test-results/`.

Operationally, Pattern A is the right fit for this repo:

- the outer smoke wrapper should own the disposable DB lifecycle
- Playwright should own browser execution and the two app servers
- the two Playwright projects should share one disposable DB, not create their own

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L5) | Add direct Playwright dependency and `test:smoke` command that routes through the outer wrapper | 5-32, 84-113 |
| [vitest.config.ts](/Users/juansaldana/Dev/Projects/atlaris/vitest.config.ts#L54) | Remove or clearly retire the dead Vitest smoke project so `test:smoke` has one meaning | 54-68 |
| [.gitignore](/Users/juansaldana/Dev/Projects/atlaris/.gitignore#L13) | Ignore Playwright output directories if defaults are used | 13-16 |
| [tests/AGENTS.md](/Users/juansaldana/Dev/Projects/atlaris/tests/AGENTS.md#L43) | Update testing module guidance so browser smoke ownership reflects Playwright | 43-70 |
| [docs/testing/test-standards.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/test-standards.md#L217) | Add repo-specific Playwright smoke guidance instead of generic future-state advice | 217-252 |

**New files:**

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Define browser runner, two projects, reporters, artifacts, and `webServer` commands |
| `tests/playwright/smoke/smoke.spec.ts` or flow-specific spec files | Minimal browser smoke skeleton to prove runner wiring |
| `tests/playwright/smoke/fixtures.ts` | Shared request/page helpers if the suite needs them |

### 3. Implementation Steps (TDD)

1. **Stand up the smallest possible Playwright skeleton first:**
   - Add direct Playwright dependency and browser install flow.
   - Create one trivial spec per project that proves `smoke-anon` and `smoke-auth` both boot.
   - Keep `smoke-auth` at `workers: 1`.

2. **Implement Playwright config around Pattern A:**
   - Use Playwright-managed Chromium, not system Chrome and not Puppeteer.
   - Inherit `SMOKE_STATE_FILE` from the outer smoke wrapper.
   - Configure two projects:
     - `smoke-anon` on one fixed port
     - `smoke-auth` on another fixed port
   - Let each project start its own app server through `scripts/smoke/start-app.ts`.

3. **Retire the dead Vitest smoke lane:**
   - Remove the empty Vitest smoke project or leave it explicitly deprecated and unreachable from `pnpm test:smoke`.
   - Update repo docs so “browser smoke” no longer points at Vitest.

4. **Validate runner behavior before real flow coverage:**
   - Confirm both app servers boot against the same disposable DB.
   - Confirm both projects can run concurrently while auth tests themselves remain serial.
   - Confirm artifacts are either gitignored or redirected to controlled output paths.

### 4. Risk Areas

- **Tooling ambiguity risk:** HIGH — leaving the dead Vitest smoke project alive will confuse `test:smoke` ownership immediately.
- **Parallelism risk:** MEDIUM — project-level parallelism is fine, test-level auth parallelism is not.
- **Artifact risk:** LOW — Playwright reports and traces will dirty the repo if output paths are not ignored.
- **Blast-radius risk:** LOW — this phase mostly adds a new runner surface rather than changing product code.

### 5. Estimated Overlap

- **With Phase 1 launchers:** Playwright `webServer` commands depend directly on `scripts/smoke/start-app.ts`.
- **With Slice 4:** spec file layout and fixture contracts are shared.
- **Merge recommendation:** land Slice 3 before any real browser spec work. The suite should prove the runner before it proves flows.

---

## Slice 4: Launch-Blocker Smoke Coverage

### 1. Current State

The launch-blocker flows are partially validated manually and partially covered by lower-level tests, but there is no committed browser smoke coverage:

- [docs/testing/smoke-test-results-2026-04-01.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md#L12) records a manual/MCP launch-blocker pass and the authenticated `/pricing` crash that was fixed.
- [src/app/pricing/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/page.tsx#L83) now uses `withServerComponentContext`, but there is still no targeted regression test for that page.
- [src/proxy.ts](/Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L29) defines the protected route prefixes the anon smoke path must verify.
- [src/app/analytics/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/analytics/page.tsx#L9) already redirects `/analytics` to `/analytics/usage`, and [tests/unit/app/analytics/page.spec.tsx](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/analytics/page.spec.tsx#L6) covers that redirect helper.
- [src/app/plans/[id]/data.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/data.ts#L5) and [src/app/plans/[id]/modules/[moduleId]/data.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/data.ts#L5) already encode the “no auth-gated cache by id alone” fix, and unit tests exist for both.
- Manual plan creation is not smoke-ready with form defaults: [UnifiedPlanInput](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/plan-form/UnifiedPlanInput.tsx#L106) defaults `deadlineWeeks` to `'4'` at [UnifiedPlanInput.tsx:111]( /Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/plan-form/UnifiedPlanInput.tsx#L111 ), but the manual smoke results explicitly show the free-tier user only succeeded after changing the deadline to `2 weeks` at [smoke-test-results-2026-04-01.md:62]( /Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md#L62 ).
- Local checkout and portal server routes already exist:
  - [create-checkout route](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/stripe/create-checkout/route.ts#L31)
  - [local complete-checkout route](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/stripe/local/complete-checkout/route.ts#L27)
  - [create-portal route](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/stripe/create-portal/route.ts#L24)
- Billing and portal client buttons already use stable labels:
  - [SubscribeButton](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/components/SubscribeButton.tsx#L138)
  - [ManageSubscriptionButton](/Users/juansaldana/Dev/Projects/atlaris/src/components/billing/ManageSubscriptionButton.tsx#L200)

Concrete gaps discovered during research:

- There is no pricing-page regression test despite the recent auth-path bug.
- There is no browser smoke harness for redirect assertions; those need request-level checks, not regular navigation.
- Launch-blocker smoke will fail if it naively submits the plan form defaults under the seeded free-tier user.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| [src/app/pricing/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/page.tsx#L83) | No product change expected; add regression coverage against the current auth path | 83-196 |
| [docs/testing/smoke-test-results-2026-04-01.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md#L12) | Historical reference for launch-blocker scope and the free-tier deadline constraint | 12-118 |

**New files:**

| File | Purpose |
|------|---------|
| `tests/unit/app/pricing/page.spec.tsx` | Targeted pricing auth-path regression test |
| `tests/playwright/smoke/anon.redirects.spec.ts` | Request-based protected-route assertions |
| `tests/playwright/smoke/auth.core.spec.ts` | Dashboard, plans, manual creation, plan detail, module detail, back-nav |
| `tests/playwright/smoke/auth.billing.spec.ts` | Pricing, checkout, billing, portal |

### 3. Implementation Steps (TDD)

1. **Pin the pricing regression first:**
   - Add a focused unit/server-component test for [src/app/pricing/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/page.tsx#L83).
   - Fail if the page stops using `withServerComponentContext`.

2. **Implement anon redirect smoke with request-level assertions:**
   - Use Playwright request context, not browser-followed navigation, for protected-route redirect checks.
   - Assert `307` and `Location: /auth/sign-in` for representative protected routes defined in [src/proxy.ts](/Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L29).

3. **Implement auth core smoke next:**
   - Cover `/dashboard`, `/plans`, `/plans/new`, manual plan creation, resulting plan detail, module detail, next/prev navigation, and back navigation.
   - Use free-tier-compatible form inputs such as `2 weeks` rather than the default `1 month`.

4. **Implement auth billing smoke after core flow is stable:**
   - Cover `/pricing`, subscribe CTA, local checkout completion, `/settings/billing`, and portal entry.
   - Keep billing after earlier free-tier-dependent assertions so subscription state does not hide core-flow regressions.

5. **Validate end-to-end:**
   - Run `pnpm test:smoke`.
   - Confirm request-based redirect assertions are precise.
   - Confirm auth browser flows complete against the disposable DB without relying on manual intervention.

### 4. Risk Areas

- **False-positive risk:** HIGH — using normal page navigation to “assert” redirects will hide the real initial `307`.
- **State-ordering risk:** HIGH — billing upgrades mutate user state, so auth smoke order matters.
- **Behavioral risk:** MEDIUM — form defaults exceed free-tier caps; tests must set explicit values.
- **Coverage risk:** LOW — route- and API-level pieces are already covered lower down, but browser orchestration is not.

### 5. Estimated Overlap

- **With Slice 3:** shares Playwright config, reporters, and fixtures.
- **With Phase 3 flows:** billing state can affect later PDF or settings specs if they share the same auth user and project.
- **Merge recommendation:** land regression/unit coverage first, then anon redirect spec, then auth core, then billing.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Phase 1 complete
  └── Slice 3: Playwright Runner and Project Architecture
        └── Slice 4a: Pricing auth-path regression test
              ├── Slice 4b: Anon redirect smoke
              ├── Slice 4c: Auth core smoke
              └── Slice 4d: Auth billing smoke
```

**Rationale:** The browser runner has to exist before real specs. Within Slice 4, the pricing regression test is cheap and locks in the recent bug fix before higher-cost browser work. Billing should land last because it mutates the seeded auth user’s state.

### Shared File Map

| File | Slice 3 | Slice 4 |
|------|---------|---------|
| [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L5) | ✅ command surface | — |
| `playwright.config.ts` | ✅ primary | ✅ consumed |
| `tests/playwright/smoke/*` | ✅ project structure | ✅ flow specs |
| [src/proxy.ts](/Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L29) | — | ✅ anon redirect contract |
| [src/app/pricing/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/page.tsx#L83) | — | ✅ regression target |
| [docs/testing/smoke-test-results-2026-04-01.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md#L57) | — | ✅ historical behavior reference |

