# Pre-Launch Smoke Test — Implementation Plan

> **Goal:** Walk through all critical user flows against localhost before Friday's launch to catch any integration issues that unit/integration tests miss.
> **Reference checklist:** [browser-smoke-testing.md](file:///Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md)

## Context

The codebase has solid unit and integration coverage, but `tests/e2e/*` is Vitest + jsdom — not a real browser. Recent commits added significant billing hardening, route protection changes, auth module updates, and plan/module data loader rewrites. These changes need end-to-end verification in a real browser before launch.

Key recent commits to validate:
- `627d509` fix(plans): use canonical DbClient in pdf-origin
- `8e28784` feat(billing): enhance subscription management and portal access
- `1522568` feat(proxy): add new protected routes and implement analytics redirection
- `1061838` feat(environment): add autogeneration script for environment setup
- `4ccb3c7` chore: update VSCode settings and enhance documentation

> **⚠️ Critical testing note from [`learnings.md`](../../docs/agent-context/learnings.md):**
> For **true anonymous** testing, `DEV_AUTH_USER_ID` must be **unset in `.env.local`** — passing `env -u DEV_AUTH_USER_ID` on the shell does NOT override values loaded from `.env.local`. Anonymous and authenticated testing require two separate server starts with different `.env.local` configurations.

## Strategy

The existing [browser-smoke-testing.md](file:///Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md) has 11 phases. For Friday's launch deadline, we should **prioritize launch-blocker flows** and skip nice-to-haves:

### Must-Do (Launch Blockers)
- **Phase 0:** Environment setup — get the app running locally
- **Phase 1:** Public surface — landing, pricing, about render correctly
- **Phase 2:** Route protection — anon users get redirected properly
- **Phase 3:** Authenticated core — dashboard, plan creation, plan detail, module detail
- **Phase 6:** Billing — pricing → checkout → portal flow works end-to-end

### Should-Do (High Value)
- **Phase 4:** PDF flow — upload works, validation errors are clean
- **Phase 5:** Generation failure/recovery — retry and regenerate work
- **Phase 7:** Settings — all settings pages load and save

### Nice-to-Have (Skip if tight on time)
- **Phase 8:** Analytics pages render
- **Phase 9:** Responsive/mobile — no broken layouts
- **Phase 10:** Resilience — back/forward, hard refresh, slow network

## Steps

### Step 0 — ~~Push unpushed commits~~ ✅ Done
All commits have been pushed to `origin/develop`.

### Step 1 — Environment setup (Phase 0)

1. Start local Postgres: `pnpm db:dev:up`
2. Bootstrap DB: `pnpm db:dev:bootstrap`
3. **For anon testing (Phases 1–2):** Comment out or remove `DEV_AUTH_USER_ID` and `LOCAL_PRODUCT_TESTING` from `.env.local`, then start the dev server:
   ```bash
   pnpm dev
   ```
4. **For auth testing (Phases 3+):** Restore `.env.local` with these values set:
   ```
   LOCAL_PRODUCT_TESTING=true
   DEV_AUTH_USER_ID=00000000-0000-4000-8000-000000000001
   STRIPE_LOCAL_MODE=true
   MOCK_AI_SCENARIO=success
   APP_URL=http://localhost:3000
   ```
   Then restart the dev server: `pnpm dev`
5. Verify `http://localhost:3000` loads without env validation errors in both modes

> **Why two server starts?** The proxy's `localProductTestingPageBypass` checks `devAuthEnv.userId` which is loaded from `.env.local` at startup. Inline env vars on the shell don't override `.env.local` values. See learnings.md for details.

### Step 2 — Public surface smoke (Phase 1)

Using the browser (anon context — no auth cookies):
- `/` → should redirect to `/landing`
- `/landing` → hero CTA works, no console errors
- `/pricing` → pricing cards render, CTAs visible
- `/about` → all sections render
- `/auth/sign-in`, `/auth/sign-up` → resolve without 404

### Step 3 — Route protection (Phase 2)

Still in anon context (server running WITHOUT `DEV_AUTH_USER_ID` in `.env.local`):
- `/dashboard` → redirect to `/auth/sign-in` (307)
- `/plans` → redirect to `/auth/sign-in` (307)
- `/plans/new` → redirect to `/auth/sign-in` (307)
- `/settings/profile` → redirect to `/auth/sign-in` (307)
- `/settings/billing` → redirect to `/auth/sign-in` (307)
- `/settings/ai` → redirect to `/auth/sign-in` (307)
- `/analytics` → redirect to `/auth/sign-in` (307, proxy catches before Next.js page redirect)
- `/analytics/usage` → redirect to `/auth/sign-in` (307)

**Special attention:** The recent commit `1522568` added `/settings` and `/analytics` to `PROTECTED_PREFIXES` and changed plan/module auth redirects. Confirm these all work correctly.

**Expected redirect behavior:** Neon Auth middleware returns `307` with `Location: /auth/sign-in` (no query params). This is documented behavior — see learnings.md.

### Step 4 — Authenticated core flows (Phase 3)

Switch to auth context (restart `pnpm dev` with `DEV_AUTH_USER_ID` and `LOCAL_PRODUCT_TESTING` restored in `.env.local`):
- `/dashboard` → loads without auth loop
- `/plans` → list page loads
- `/plans/new` → create a plan manually, verify generation starts
- Visit resulting plan detail page → modules/tasks render
- Click into a module → module page loads, prev/next nav works

**Special attention:** The recent billing commit (`8e28784`) changed `loadPlanForPage` and `loadModuleForPage` to remove `cache()` memoization — verify these pages actually load plan/module data correctly and don't regress.

### Step 5 — Billing flow (Phase 6)

Still in auth context with `STRIPE_LOCAL_MODE=true`:
- `/pricing` → local pricing catalog renders with correct portal eligibility
- Click a paid subscribe CTA → local checkout flow starts
- Complete checkout → lands on billing page
- `/settings/billing` → billing cards render, usage data visible
- "Manage Subscription" button → shows correct state based on `canOpenBillingPortal`

**Special attention:** The billing hardening commit (`8e28784`) added portal eligibility checks, price catalog validation, and customer provisioning locks. Verify the billing surface reflects these correctly.

### Step 6 — Document results

Create a results file at `docs/testing/smoke-test-results-2026-04-01.md` with:
- Pass/fail for each phase
- Any defects found (with severity and launch-blocker flag)
- Screenshots of defects
- Action items for any blockers

### Step 7 — Fix any launch blockers found

If any launch-blocker defects are found, fix them immediately before marking this complete.

---

## Must-pass scope (automated smoke)

The following are **locked acceptance criteria** for `pnpm test:smoke` (Vitest smoke project, `tests/smoke/prelaunch.smoke.spec.ts`). Preconditions: `pnpm db:dev:up`, `pnpm db:dev:bootstrap`, local Chrome available for Puppeteer-core; **no** other `pnpm dev` / `next dev` for this repo; smoke uses **port 3100** and `APP_URL=http://localhost:3100`.

| Area | Evidence command | Expected result |
|------|------------------|-----------------|
| Anon protected-route redirects | `pnpm test:smoke` (anon HTTP phase) | Raw HTTP `redirect: 'manual'`: routes under [`src/proxy.ts`](../../src/proxy.ts) `PROTECTED_PREFIXES` for user-facing checks (`/dashboard`, `/plans`, `/plans/new`, `/settings/*`, `/analytics`, `/analytics/usage`, `/analytics/achievements`, …) → **307** and `Location` → `/auth/sign-in` (no query) |
| Auth dashboard, plans, `/plans/new` | same | Browser: pages load without auth loop |
| Manual plan creation + module nav | same | Deterministic topic; plan detail and module prev/next + back |
| PDF upload → extract → generate | same | Temp PDF (no committed fixture); plan view loads after generate |
| Profile + AI settings saves | same | Profile name + AI model (`google/gemini-2.0-flash-exp:free`) persist after refresh |
| Integrations + notifications | same | Load-only (no persistent save in UI) |
| Billing (last in run) | same | `/pricing` → local checkout → `/settings/billing` subscribed → portal action |
| `/plans` search field a11y | `pnpm test:changed` (PlansList unit) | Search input has `id` + `name` + accessible name |
| Pricing auth path | `pnpm test:changed` (pricing page unit) | `withServerComponentContext` used; page renders |

**Deviation rule:** Any change from this table gets a dated note in this PRD the same day it lands.

## Validation

- `pnpm test:smoke` passes (anon HTTP + auth browser phases in one command)
- `pnpm test:changed` passes after unit test edits
- `pnpm lint` and `pnpm type-check` pass before close
- Review section in [todos.md](./todos.md) records exact commands and observed results for each AC
