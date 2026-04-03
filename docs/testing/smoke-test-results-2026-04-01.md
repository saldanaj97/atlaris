# Smoke Test Results — 2026-04-01

## Scope

- Environment: local dev server on `http://localhost:3000`
- Database: local Postgres container on `localhost:54331`
- Browser automation: `chrome-devtools` CLI / Chrome DevTools MCP command surface
- Modes tested:
  - Anonymous startup with `DEV_AUTH_USER_ID` unset in `.env.local`
  - Authenticated local-product-testing startup with `DEV_AUTH_USER_ID=00000000-0000-4000-8000-000000000001`, `LOCAL_PRODUCT_TESTING=true`, `STRIPE_LOCAL_MODE=true`

## Summary

- Launch-blocker phases covered: Phase 1, Phase 2, Phase 3, Phase 6
- Launch-blocker result: Passed after one code fix
- Defects found: 1 blocker, 1 non-blocking issue

## Results By Phase

### Phase 0 — Environment Setup

- `pnpm db:dev:bootstrap` passed
- Anonymous server startup passed with no env validation errors
- Authenticated server startup passed with no env validation errors

### Phase 1 — Public Surface (Anonymous)

- `/` returned `307` to `/landing`
- `/landing` rendered hero and CTA with no console errors
- `/pricing` rendered pricing cards and CTAs with no console errors
- `/about` rendered expected sections with no console errors
- Auth routes resolved successfully:
  - `/auth/sign-in`
  - `/auth/sign-up`
  - `/auth/forgot-password`
  - `/auth/reset-password`
  - `/auth/magic-link`
  - `/auth/two-factor`
  - `/auth/sign-out`

### Phase 2 — Route Protection (Anonymous)

- Verified all tested protected routes returned `307` with `Location: /auth/sign-in`
- Confirmed on true anonymous startup for:
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

### Phase 3 — Authenticated Core

- `/dashboard` loaded without auth loop
- `/plans` loaded and showed existing plans
- `/plans/new` loaded; manual/PDF tab switching worked
- Manual plan creation succeeded after adjusting the deadline to the free-tier-compatible `2 weeks`
- Generated plan detail loaded with modules/tasks
- Module detail loaded correctly
- Next-module navigation worked
- Navigation back from module to plan to list worked
- `/analytics` returned page-level redirect to `/analytics/usage`

### Phase 6 — Billing

- Initial authenticated `/pricing` run failed with a 500 and blocked the billing flow
- Root cause: pricing page used `getCurrentUserRecordSafe()` instead of `withServerComponentContext()`
- Fix applied in [`src/app/pricing/page.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/page.tsx)
- After fix:
  - `/pricing` rendered correctly in auth mode
  - Portal eligibility message showed correctly before checkout
  - Starter subscribe CTA launched local checkout
  - Local checkout returned to `/settings/billing`
  - Billing page showed Starter plan and usage cards
  - Manage Subscription button remained available after checkout
  - Local portal path returned to `/settings/billing?local_portal=1`

## Defects

### 1. Authenticated pricing page crash

- Severity: High
- Launch blocker: Yes
- Route: `/pricing`
- Symptom: 500 error and Next.js error overlay during auth-mode pricing visit
- Cause: inconsistent async server-component auth path on pricing page
- Fix: replaced `getCurrentUserRecordSafe()` with `withServerComponentContext((currentUser) => currentUser)` in [`src/app/pricing/page.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/pricing/page.tsx)
- Status: Fixed and reverified

### 2. Plans page accessibility issue warning

- Severity: Low
- Launch blocker: No
- Route: `/plans`
- Symptom: Chrome DevTools surfaced one issue-level warning that a form field lacked an `id` or `name`
- Status: Not fixed in this pass

## Verification Commands

```bash
pnpm db:dev:bootstrap
pnpm dev
pnpm test:changed
chrome-devtools navigate_page --url http://localhost:3000/landing
chrome-devtools navigate_page --url http://localhost:3000/plans/new
chrome-devtools navigate_page --url http://localhost:3000/pricing
```

## Notes

- Anonymous verification was only trusted after restarting the app with `DEV_AUTH_USER_ID` actually removed from `.env.local`; shell-level unsets are not sufficient in this repo.
- The first manual plan submission failed correctly because the default `1 month` deadline exceeded the free-tier 2-week cap. After switching to `2 weeks`, generation succeeded.
- Optional PDF upload execution and settings mutation flows were not completed in this run.
