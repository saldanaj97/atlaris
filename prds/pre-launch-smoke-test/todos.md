# Pre-Launch Smoke Test — Todos

> **Parent plan:** [plan.md](./plan.md)
> **Reference checklist:** [browser-smoke-testing.md](../../docs/testing/browser-smoke-testing.md)
> **Launch target:** Friday, April 3, 2026

## Notes

- **Automated gate:** `pnpm test:smoke` runs the repo-native harness (`tests/smoke/prelaunch.smoke.spec.ts`, Puppeteer-core + raw HTTP redirects). Preflight fails if another dev server is already running; smoke uses **PORT=3100** and backs up/restores `.env.local` outside the repo.
- Follow the evidence sweep pattern from the smoke testing doc when debugging manually: snapshot, console, network after each navigation.
- Track defects inline using the defect log format from the smoke testing doc.
- **⚠️ Critical:** Anon and auth phases use **two separate server lifecycles** with different `.env.local` contents. `DEV_AUTH_USER_ID` must be **absent** for anon — passing `env -u` on the shell does NOT override `.env.local`. See [`learnings.md`](../../docs/agent-context/learnings.md).

## Prerequisites

- [x] Push 5 unpushed commits to `origin/develop` — ✅ Done (2026-04-01)
- [ ] Verify CI passes on the pushed commits

## Phase 0: Environment Setup

- [ ] `pnpm db:dev:up` — local Postgres reachable
- [x] `pnpm db:dev:bootstrap` — migrations, RLS grants, seed data
- [x] **Anon mode:** Comment out `DEV_AUTH_USER_ID` and `LOCAL_PRODUCT_TESTING` in `.env.local`, start `pnpm dev`
- [x] Confirm no env validation errors in dev server output (anon mode)
- [x] **Auth mode:** Restore `DEV_AUTH_USER_ID`, `LOCAL_PRODUCT_TESTING=true`, `STRIPE_LOCAL_MODE=true`, `MOCK_AI_SCENARIO=success` in `.env.local`, restart `pnpm dev`
- [x] Confirm no env validation errors in dev server output (auth mode)

## Phase 1: Public Surface (Anon)

- [x] `/` redirects to `/landing`
- [x] `/landing` renders hero, CTA works, no console errors
- [x] `/pricing` renders pricing cards with CTAs
- [x] `/about` renders all sections
- [x] Auth routes resolve (`/auth/sign-in`, `/auth/sign-up`, etc.)

## Phase 2: Route Protection (Anon) — 🔴 Launch Blocker

> **Must test with `DEV_AUTH_USER_ID` unset in `.env.local`** — server running in true anon mode.
> **Expected:** All protected routes return `307` redirect to `/auth/sign-in` (no query params).

- [x] `/dashboard` → 307 redirect to `/auth/sign-in`
- [x] `/plans` → 307 redirect to `/auth/sign-in`
- [x] `/plans/new` → 307 redirect to `/auth/sign-in`
- [x] `/settings/profile` → 307 redirect to `/auth/sign-in`
- [x] `/settings/billing` → 307 redirect to `/auth/sign-in`
- [x] `/settings/ai` → 307 redirect to `/auth/sign-in`
- [x] `/settings/integrations` → 307 redirect to `/auth/sign-in`
- [x] `/settings/notifications` → 307 redirect to `/auth/sign-in`
- [x] `/analytics` → 307 redirect to `/auth/sign-in` (proxy catches before page-level redirect to `/analytics/usage`)
- [x] `/analytics/usage` → 307 redirect to `/auth/sign-in`
- [x] `/analytics/achievements` → 307 redirect to `/auth/sign-in`

## Phase 3: Authenticated Core Flows — 🔴 Launch Blocker

> **Must test with `DEV_AUTH_USER_ID` + `LOCAL_PRODUCT_TESTING=true` restored in `.env.local`** — server restarted in auth mode.

- [x] `/dashboard` loads without auth loop
- [x] `/plans` list page loads (empty or populated state)
- [x] `/plans/new` loads, manual/PDF tabs switch correctly
- [x] Create a plan manually → generation starts (with `MOCK_AI_SCENARIO=success`)
- [x] Plan detail page loads with modules/tasks (validates `loadPlanForPage` after `cache()` removal)
- [x] Module detail page loads with tasks, prev/next nav works (validates `loadModuleForPage` after `cache()` removal)
- [x] Back navigation from module → plan → list works
- [x] `/analytics` → redirects to `/analytics/usage` (page-level redirect, not proxy)

## Phase 6: Billing Flow — 🔴 Launch Blocker

- [x] `/pricing` renders local pricing catalog
- [x] Portal eligibility message shows correctly for users without subscription
- [x] Click paid subscribe CTA → local checkout flow starts
- [x] Complete local checkout → lands on billing page
- [x] `/settings/billing` shows plan/usage cards
- [x] "Manage Subscription" button reflects correct portal eligibility
- [x] Upgrade nudges from free-user surfaces link to pricing correctly

## Phase 4: PDF Flow (automated smoke)

- [ ] `pnpm test:smoke` — temp PDF upload → extract/preview → generate → plan view loads

## Phase 5: Generation Failure/Recovery (optional / manual)

- [ ] Observe pending/generating UI (loading indicators present)
- [ ] Plan failure → retry action works
- [ ] Regenerate from existing plan works

## Phase 7: Settings (automated smoke)

- [ ] `/settings/profile` — load, save deterministic name, verify after refresh
- [ ] `/settings/ai` — save free-tier model (`google/gemini-2.0-flash-exp:free`), verify after refresh
- [ ] `/settings/integrations` — load-only
- [ ] `/settings/notifications` — load-only

## Post-Test

- [x] Document results in `docs/testing/smoke-test-results-2026-04-01.md`
- [x] Fix any launch-blocker defects found
- [ ] Commit and push fixes
- [ ] Close issue #283 (PDF schema gap — already resolved, just needs closure)

## Review (template — fill after `pnpm test:smoke`)

| AC | Command | Result |
|----|---------|--------|
| Anon redirects | `pnpm test:smoke` | (pass/fail) |
| Auth flows + PDF + settings + billing | `pnpm test:smoke` | (pass/fail) |
| Pricing unit regression | `pnpm test:changed` or `./scripts/test-unit.sh tests/unit/app/pricing/page.spec.tsx` | (pass/fail) |
| PlansList a11y | `./scripts/test-unit.sh tests/unit/components/PlansList.spec.tsx` | (pass/fail) |
| Lint / types | `pnpm lint`, `pnpm type-check` | (pass/fail) |

Historical notes:

- Authenticated `/pricing` initially failed with a 500 in local product-testing mode because it used `getCurrentUserRecordSafe()` instead of the repo-standard `withServerComponentContext()` path for async server components. Swapping to `withServerComponentContext()` fixed the billing flow and removed the crash.
- Anonymous and authenticated passes require separate server lifecycles so route-protection assertions are based on true anon startup, not leaked `DEV_AUTH_USER_ID` from `.env.local`.

## Defect Log

*(Track defects here as they're found)*

| # | Route | Severity | Launch Blocker | Description | Status |
|---|-------|----------|----------------|-------------|--------|
| 1 | `/pricing` (auth mode) | High | Yes | Authenticated pricing page crashed with 500/unhandled rejection during smoke test because it used a non-standard server-component auth path; fixed by switching to `withServerComponentContext()` in `src/app/pricing/page.tsx`. | Fixed |
| 2 | `/plans` | Low | No | Chrome DevTools reported one issue-level accessibility warning: a form field lacked an `id` or `name` attribute on the plans list page. No user-facing breakage observed during the smoke run. | Open |
