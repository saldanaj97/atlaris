# Browser smoke testing checklist (localhost)

## Context

The repo has solid unit and integration coverage, but `tests/e2e/*` is Vitest + jsdom, not a real browser—so real navigation, redirects, and billing still need manual or MCP-driven verification.

**Scope:** “Test every single URL” is a trap. The useful target is **routes plus meaningful branches**: persona (anon vs signed-in), auth/session shape, subscription tier, plan data state, and device.

**Pre-launch suspects (confirm or clear in Phase 2 / Analytics phases):**

| Suspect | Pointers |
| --- | --- |
| Analytics nav may point at `/analytics` without a real page | `src/features/navigation/routes.ts:17`, `src/features/navigation/items.ts:18` |
| Middleware may not protect `/settings` or `/analytics` the same way as core app routes | `src/proxy.ts:29` |
| Plan/module redirects may use `/sign-in?...` instead of `/auth/sign-in?...` | `src/app/plans/[id]/components/PlanDetailContent.tsx:33`, `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx:42` |

---

## Conventions

### Two browser contexts

Use **two** browser contexts so auth state does not leak between anon and signed-in passes.

1. **Anon context** — No local auth overrides; treat as unauthenticated.
2. **Auth context** — App running with:

   - `LOCAL_PRODUCT_TESTING=true`
   - `DEV_AUTH_USER_ID=00000000-0000-4000-8000-000000000001`
   - `STRIPE_LOCAL_MODE=true`
   - `MOCK_AI_SCENARIO=success`
   - `APP_URL=http://localhost:3000`

### Evidence sweep (after navigation or major action)

- `take_snapshot`
- `list_console_messages`
- `list_network_requests`
- Inspect failures with `get_network_request`
- `take_screenshot` on defects

### Optional: deeper or follow-up passes

When you need a **full link/action inventory** (beyond this checklist), use Chrome MCP in a structured way: `navigate_page` + `take_snapshot`; `evaluate_script` to list internal links, CTAs, buttons, tabs, dropdowns, and forms; expand nav menus / accordions / tabs / dialogs once, then rescan so hidden branches are not missed; keep a **visited set** so the walk is systematic, not random clicking.

### Coverage matrix (for later / pro / edge cases)

When extending beyond the default matrix, explicitly include:

- **Personas:** anonymous, authenticated free, authenticated pro, stale/expired session, maintenance-mode visitor.
- **Data states:** no plans; ready / pending / failed plan; quota-exhausted; active vs canceled subscription.
- **Devices:** desktop and mobile (see Phase 9).

---

## Localhost checklist

### Phase 0: Environment

- [ ] `pnpm db:dev:up` succeeds  
  **Expected:** local Postgres is reachable
- [ ] `pnpm db:dev:bootstrap` succeeds  
  **Expected:** migrations, RLS grants, and seeded local product-testing user exist
- [ ] `pnpm dev` starts on `http://localhost:3000`  
  **Expected:** app loads without env validation errors
- [ ] Local product-testing mode is active  
  **Expected:** protected app routes can load in auth context without real Neon login
- [ ] Local Stripe mode is active  
  **Expected:** pricing and checkout flows use local billing paths, not real Stripe

### Phase 1: Public surface

- [ ] Visit `/` in anon  
  **Expected:** redirects to `/landing`
- [ ] Visit `/landing`  
  **Expected:** page renders, main hero CTA works, no console errors
- [ ] Click all primary header links from landing  
  **Expected:** Home / Pricing / About navigate correctly
- [ ] Visit `/pricing`  
  **Expected:** pricing cards render, CTAs are visible, no broken pricing content
- [ ] Visit `/about`  
  **Expected:** all sections render, CTA targets are valid
- [ ] Visit auth routes:
  - `/auth/sign-in`
  - `/auth/sign-up`
  - `/auth/forgot-password`
  - `/auth/reset-password`
  - `/auth/magic-link`
  - `/auth/two-factor`
  - `/auth/sign-out`  
  **Expected:** each route resolves, no 404, no broken shell
- [ ] Visit `/maintenance`  
  **Expected:** page renders directly when hit

### Phase 2: Route protection

Run these in **anon**.

- [ ] Visit `/dashboard`  
  **Expected:** redirect to `/auth/sign-in`
- [ ] Visit `/plans`  
  **Expected:** redirect to `/auth/sign-in`
- [ ] Visit `/plans/new`  
  **Expected:** redirect to `/auth/sign-in`
- [ ] Visit `/plans/<real-plan-id>` if available  
  **Expected:** redirect to sign-in, not broken route
- [ ] Visit `/plans/<real-plan-id>/modules/<real-module-id>` if available  
  **Expected:** redirect to sign-in, not broken route
- [ ] Visit `/settings/profile`  
  **Expected:** should be protected or clearly handle anonymous access safely
- [ ] Visit `/settings/billing`  
  **Expected:** should be protected or redirect consistently
- [ ] Visit `/settings/ai`  
  **Expected:** should be protected or redirect consistently
- [ ] Visit `/settings/integrations`  
  **Expected:** confirm whether this is intentionally public or a bug
- [ ] Visit `/settings/notifications`  
  **Expected:** confirm whether this is intentionally public or a bug
- [ ] Visit `/analytics`  
  **Expected:** either valid page or obvious defect
- [ ] Visit `/analytics/usage`  
  **Expected:** confirm auth behavior and page render
- [ ] Visit `/analytics/achievements`  
  **Expected:** confirm auth behavior and page render

**Known suspects to confirm**

- [ ] Click top-nav Analytics  
  **Expected:** valid destination  
  **Risk:** nav points to `/analytics`, which may not exist
- [ ] Trigger unauthenticated plan-detail redirect  
  **Expected:** `/auth/sign-in?...`  
  **Risk:** code appears to use `/sign-in?...`

### Phase 3: Authenticated free user core

Run in **auth**.

- [ ] Visit `/dashboard`  
  **Expected:** dashboard shell loads, no auth loop
- [ ] Visit `/plans`  
  **Expected:** list page loads, empty or populated state is coherent
- [ ] Click Create plan  
  **Expected:** lands on `/plans/new`
- [ ] Switch between manual and PDF tabs on `/plans/new`  
  **Expected:** tab state changes correctly, URL behavior is sane
- [ ] Create a plan manually  
  **Expected:** form submits, generation starts, user lands on plan detail or pending state
- [ ] Refresh during/after manual generation  
  **Expected:** state recovers cleanly
- [ ] Visit resulting `/plans/<id>`  
  **Expected:** detail page loads with modules/tasks
- [ ] Click into `/plans/<id>/modules/<moduleId>`  
  **Expected:** module page loads, prev/next module nav works
- [ ] Use back navigation from module to plan and plan to list  
  **Expected:** no broken history state

### Phase 4: PDF flow

Run in **auth**.

- [ ] Upload a valid PDF through the PDF flow  
  **Expected:** extraction succeeds and preview appears
- [ ] Edit extracted topic/sections/settings if UI allows  
  **Expected:** edits persist in the preview before submission
- [ ] Submit PDF-derived plan generation  
  **Expected:** plan creation succeeds and routes correctly
- [ ] Upload a non-PDF file  
  **Expected:** clean validation error
- [ ] Upload an oversized PDF  
  **Expected:** clean validation error
- [ ] Upload a PDF with too many pages  
  **Expected:** clean validation error
- [ ] Revisit `/plans/new?method=pdf`  
  **Expected:** PDF mode loads directly and remains stable

### Phase 5: Generation failure / recovery

You should intentionally rerun this phase later with different mock settings, but even now verify visible recovery paths.

- [ ] Observe pending/generating UI  
  **Expected:** loading indicators appear, no dead-end spinner
- [ ] If a plan fails, use retry  
  **Expected:** retry action works and status updates
- [ ] If available, use regenerate from an existing plan  
  **Expected:** regenerate path works and returns to valid plan state
- [ ] Confirm max-retry exhausted UI if reproducible  
  **Expected:** clear fallback path to create a new plan

### Phase 6: Billing and monetization

Run in **auth** with `STRIPE_LOCAL_MODE=true`.

- [ ] Visit `/pricing`  
  **Expected:** local pricing catalog renders
- [ ] Click paid subscribe CTA  
  **Expected:** local checkout flow starts, not real Stripe failure
- [ ] Complete local checkout return  
  **Expected:** lands on `/settings/billing` or configured billing return page
- [ ] Visit `/settings/billing`  
  **Expected:** plan/usage cards render without auth errors
- [ ] Click Manage Subscription  
  **Expected:** local billing portal path works
- [ ] Verify upgrade nudges from free-user surfaces  
  **Expected:** upgrade links point to pricing or billing correctly

**Note:** Billing is launch-critical—if local checkout/portal is flaky, treat it as a launch risk even if unit tests pass.

### Phase 7: Settings

Run in **auth**.

- [ ] Visit `/settings/profile`  
  **Expected:** profile data loads
- [ ] Edit and save profile  
  **Expected:** success state is visible and persists after refresh
- [ ] Visit `/settings/ai`  
  **Expected:** available models render for free tier
- [ ] Change and save AI preference  
  **Expected:** save succeeds and persists after refresh
- [ ] Visit `/settings/integrations`  
  **Expected:** integrations cards render, statuses make sense
- [ ] Visit `/settings/notifications`  
  **Expected:** static/coming-soon UI renders cleanly
- [ ] Click through settings sidebar items  
  **Expected:** all destinations work, no broken active state

### Phase 8: Analytics

Run in **auth**.

- [ ] Click nav Analytics  
  **Expected:** valid route
- [ ] Visit `/analytics/usage`  
  **Expected:** page renders without crashes
- [ ] Visit `/analytics/achievements`  
  **Expected:** page renders without crashes
- [ ] Refresh each analytics page  
  **Expected:** no routing or hydration problems

### Phase 9: Responsive and browser behavior

At minimum test these on **mobile emulation**:

- `/landing`
- `/pricing`
- `/plans/new`
- `/plans/<id>`
- `/settings/billing`

**Checklist:**

- [ ] Mobile nav usable
- [ ] No clipped CTAs or broken forms
- [ ] PDF upload UI still usable
- [ ] Plan detail readable without horizontal overflow
- [ ] Billing/settings cards stack correctly

### Phase 10: Resilience

- [ ] Browser back/forward on all core flows  
  **Expected:** route state remains coherent
- [ ] Hard refresh on deep links  
  **Expected:** pages recover without blank/error shells
- [ ] Open key links in new tabs  
  **Expected:** direct loads work
- [ ] Slow network emulation on `/plans/new` and billing flows  
  **Expected:** loading states are understandable, no timeouts/hangs
- [ ] Run `lighthouse_audit` on `/landing`, `/pricing`, `/about`  
  **Expected:** no obvious accessibility/SEO/best-practice regressions

---

## Defect log format

Track each failure with:

- Route
- Persona/context: anon or auth
- Preconditions
- Exact steps
- Expected result
- Actual result
- Console/network evidence
- Screenshot
- Severity: blocker, major, minor
- Launch-blocker: yes/no (see below)

---

## Blockers before launch

If any of these fail, treat launch as **not** ready:

- Manual plan creation
- PDF plan creation
- Auth redirects (including consistent `/auth/sign-in` and return paths)
- Billing checkout/portal path
- Top-nav links
- Core pages loading without uncaught runtime errors or failed critical network requests on primary flows
- Mobile usability on launch-critical routes

**After this exploratory pass:** promote the highest-value phases into an **automated or scripted browser smoke suite** (Playwright, CI, or MCP)—one-off manual runs are not enough for regression safety.

**Non-local environments:** Repeat at least Phases 1–2, 6, and blocker-relevant flows against your real deployment (staging/production) before launch; localhost env flags will not match production auth/billing.
