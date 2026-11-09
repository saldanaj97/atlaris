# DEV-208 handoff: pre-launch security audit open items

Design handoff for [DEV-208](https://linear.app/saldana-software/issue/DEV-208/review-the-open-items-from-the-pre-launch-security-audit-before-launch). Written 2026-11-05 against `origin/develop` at `892ca05`. It is self-contained: an implementing agent can work from this file alone. Launch is Fri 2026-11-13; the `launch-waitlist` flag comes off Thu 2026-11-12 evening (DEV-200).

> **Status note (2026-11-06).** This is a design document, so the test paths below are the paths it *planned*; several differ from what shipped in #941 and #946. Find the as-built tests with `grep -rln` on the symbol, not the path. As built: the proxy cases are split across `tests/unit/lib/proxy-*.spec.ts` (there is no `proxy.spec.ts`); the AI spend admission helper lives in `src/features/billing/ai-spend-guard.ts` (`assertAiSpendAllowed`, not a helper in `rate-limit.ts`) and is covered by `tests/unit/features/billing/ai-spend-guard.spec.ts` (not `tests/unit/lib/api/rate-limit.spec.ts`); the spend query is covered by `tests/integration/db/plan-ai-budget.queries.spec.ts` (not `plan-ai-budget.spec.ts`). #946 added per-tier daily AI spend pools on top of the design here. Do not recreate the planned paths.

Leads 1 and 2 from the audit were fixed in PR 930 (merged to `develop` 2026-11-04) and are not covered here, except for one follow-up check under [Juan's hands](#part-b-juans-hands).

## How to use this document

- **Part A** is the code work. Each item says whether the audit lead is real, what the evidence is, the exact change, the tests, and the risk. Implement in the order given; group into the PRs listed under [PR plan](#pr-plan).
- **Part B** is everything that needs Juan: provider dashboards, production facts, and decisions. Nothing in Part A blocks on Part B unless the item says so.
- Repo rules that apply to every PR: open it against `develop`; run `pnpm lint`, `pnpm exec oxfmt --check <files>`, `pnpm typecheck`, and `pnpm test unit <changed spec paths>`; update `docs/README.md` whenever a file under `docs/` is added, moved, or removed; record the checks actually run in the PR body. Read `AGENTS.md` and `ENGINEERING_RULES.md` first. Cloud sessions need `export PATH=/opt/node24/bin:$PATH`.
- Test rules from the audit: dummy data only, no audit traffic to production. Staging probes are Juan's to run.

## Verdict summary

| #   | Item                                                        | Real?                                                                                                                                                                                                                                                                                                                | Decision                                                                                                                      | Where                                                                                                                 |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 3   | Encoded URLs past the proxy and site gate                   | **Not reproducible on Next 16.4.3 itself** (local probe: encoded static segments 404). The site gate cannot be skipped by encoding either way: it redirects every non-exempt path. Vercel's routing layer is unverified for the sign-in check. The related matcher gap (`/plans/x.txt` skips the proxy) **is real**. | Fix before launch: cheap, closes the matcher gap, and makes sign-in protection independent of Vercel behavior                 | [A1](#a1-lead-3-normalize-the-proxy-path-and-close-the-matcher-gap)                                                   |
| 4   | CSRF on plan mutation routes                                | **Hardening, not a finding**, if the production `__session` cookie is `SameSite=Lax` as Clerk documents. Needs Juan's cookie check to close.                                                                                                                                                                         | Fix before launch anyway: same-origin check + JSON content type. `authorizedParties` only after Juan confirms origins         | [A2](#a2-lead-4-same-origin-and-content-type-checks-on-mutating-routes), [B3](#b3-__session-cookie-attributes-lead-4) |
| —   | Per-user AI spend cap                                       | **Real gap**: nothing bounds one user's total spend; worst case is far above the per-tier provider key limits                                                                                                                                                                                                        | Build before launch if Juan picks numbers by 2026-11-10; otherwise rely on provider caps and ship in the first post-launch PR | [A3](#a3-per-user-ai-spend-cap), [B6](#b6-spend-cap-decisions)                                                        |
| 5   | Worker hashes any body size before the signature check      | **Confirmed by reading** `workers/jobs/src/http/signature.ts:56`; Cloudflare allows 100 MB request bodies on Free/Pro zones against a 128 MB isolate                                                                                                                                                                 | Fix before launch: 30-minute change                                                                                           | [A4](#a4-lead-5-cap-the-signed-request-body-and-hash-it-once)                                                         |
| 7   | Retried `claim-run` step abandons its own email run         | **Confirmed by reading** `workers/jobs/src/workflows/email-delivery/run.ts:295-307`                                                                                                                                                                                                                                  | Fix before launch: one condition plus a test                                                                                  | [A5](#a5-lead-7-let-a-retried-claim-run-step-re-enter-its-own-run)                                                    |
| 8   | Unpinned actions in `react-doctor.yml`                      | **Confirmed**; both tags are mutable                                                                                                                                                                                                                                                                                 | Fix before launch: 10 minutes                                                                                                 | [A6](#a6-lead-8-pin-the-react-doctor-workflow-actions)                                                                |
| 6   | Long grounded lesson runs orphaned by the 15-minute cleanup | **Plausible by reading**, but the `grounded-generation` flag defaults off and stays off through launch (DEV-163)                                                                                                                                                                                                     | Defer to post-launch with DEV-163; design is below so it is not lost                                                          | [A7](#a7-lead-6-tie-lesson-writes-to-the-owning-workflow-run-post-launch)                                             |
| —   | `postgres-js` edge cases                                    | Real but rare, no data exposure                                                                                                                                                                                                                                                                                      | Accept for launch; add a Sentry alert                                                                                         | [A8](#a8-postgres-js-edge-cases-accept-and-watch)                                                                     |
| —   | Active-plan cap                                             | Working as designed                                                                                                                                                                                                                                                                                                  | Confirm intent; no code                                                                                                       | [B7](#b7-active-plan-cap-confirm-the-intent)                                                                          |
| —   | Vercel `X-Forwarded-For`                                    | **Settled from Vercel docs**: Vercel overwrites it; app hosts are DNS-only in Cloudflare                                                                                                                                                                                                                             | No code change                                                                                                                | [B4](#b4-vercel-headers-settled)                                                                                      |
| —   | Maintenance and health tokens unset                         | Code fails closed on every hosted deploy (`NODE_ENV=production` on preview, staging, and production)                                                                                                                                                                                                                 | Juan confirms env names only                                                                                                  | [B8](#b8-production-environment-values)                                                                               |
| —   | Supabase Data API exposure                                  | Unverified; `api.enabled=false` in `supabase/config.toml` is local only, and migration `0031` grants `SELECT` on every table to `anon`                                                                                                                                                                               | Juan turns the hosted Data API off or confirms it is off                                                                      | [B13](#b13-supabase-data-api)                                                                                         |

## PR plan

Three PRs against `develop`, smallest and highest-value first. Each is independent.

1. **PR 1, launch hardening (A1, A2, A4, A5, A6).** About half a day. All five are small, test-covered, and low-risk. Ship by 2026-11-10 so a promotion to `main` lands before the flag-off.
2. **PR 2, per-user spend cap (A3).** Starts when Juan answers [B6](#b6-spend-cap-decisions). About half a day once the numbers exist.
3. **PR 3, post-launch (A7, A8 alert).** After launch, tied to DEV-163.

---

## Part A: code fixes

### A1. Lead 3: normalize the proxy path and close the matcher gap

**Claim.** `src/proxy.ts` and `src/lib/proxy/middleware-policy.ts` compare the raw `request.nextUrl.pathname` with `startsWith` and equality, so `/%64ashboard` might skip `auth.protect()` and the waitlist or maintenance redirect while Next still routes it to `/dashboard`.

**Evidence.** A throwaway Next 16.4.3 app (the lockfile version) with `app/dashboard/page.tsx`, `app/plans/[id]/page.tsx`, `app/api/foo/route.ts`, the repo's exact `config.matcher`, and a `proxy.ts` that echoes `request.nextUrl.pathname` into a response header was run with `next dev --webpack` and with `next build && next start`. Both servers gave the same results:

| Request                   | Proxy ran | `nextUrl.pathname` seen by the proxy | Result                                                                              |
| ------------------------- | --------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `/dashboard`              | yes       | `/dashboard`                         | 200, dashboard page                                                                 |
| `/%64ashboard`            | yes       | `/%64ashboard`                       | **404**                                                                             |
| `/%61pi/foo`              | yes       | `/%61pi/foo`                         | **404**                                                                             |
| `/%2564ashboard`          | yes       | `/%2564ashboard`                     | 404                                                                                 |
| `/dashboard%2F`           | yes       | `/dashboard%2F`                      | 404                                                                                 |
| `/dashboard/..%2f`        | yes       | `/dashboard/..%2f`                   | 404                                                                                 |
| `/plans/%2e/x`            | yes       | `/plans/x`                           | 200, plan page (URL parser normalizes dot segments before the proxy)                |
| `/plans/%2e%2e/dashboard` | yes       | `/dashboard`                         | 200, dashboard page (normalized before the proxy, so the policy sees the real path) |
| `//dashboard`             | no        | —                                    | 308 to `/dashboard` (Next collapses repeated slashes before middleware)             |
| `/%ZZashboard`            | yes       | `/%ZZashboard`                       | 404                                                                                 |
| `/plans/x.txt`            | **no**    | —                                    | **200, plan page rendered without the proxy**                                       |

So on the Next server itself, percent-encoded static segments do not resolve to the real route, dot segments are normalized before the proxy sees them, and the only reproduced hole is the matcher's extension exclusion: `/plans/x.txt` reaches the dynamic `plans/[id]` page with no proxy, no CSP, no site gate, and no `clerkMiddleware` (in the real app, Clerk's `auth()` then throws, so the page errors rather than renders, but the gate and CSP are still skipped).

**What encoding can and cannot skip.** The site gate is deny-by-default: `resolveSiteGateRedirectPath` redirects every path that is not exempt, not the gate page, and not `/`, so a raw `/%64ashboard` is redirected to the gate page whether or not it is decoded. Encoding cannot get past the waitlist or maintenance gate. The only policy that is allow-by-default is `isProtectedRoute` (protected when a prefix matches), so the exposure is the sign-in redirect once the gate is off, and only if the platform routes the encoded path to the real page.

**Unknown.** Whether Vercel's routing layer decodes the path when it picks the function and sets `x-matched-path`. If it does, the proxy could see `/%64ashboard` while Next renders `/dashboard`, and with the gate off the sign-in redirect would be skipped. Only a request against a Vercel deployment settles it; see [B1](#b1-encoded-path-probe-on-staging-lead-3). The fix below is cheap and removes the dependency on that answer, so implement it regardless.

**Fix.**

1. Add `src/lib/proxy/normalize-pathname.ts`:

   ```ts
   /**
    * The path the policy functions compare against. Decodes once, like Next does
    * for route params, so an encoded segment cannot differ from the routed one.
    * Returns null when the path is not valid percent-encoding; the proxy denies it.
    */
   export function normalizeProxyPathname(pathname: string): string | null {
     try {
       return decodeURIComponent(pathname);
     } catch {
       return null;
     }
   }
   ```

2. In `src/proxy.ts` `handleProxyRequest` (line 96), replace `const { pathname } = request.nextUrl;` with:

   ```ts
   const pathname = normalizeProxyPathname(request.nextUrl.pathname);
   if (pathname === null) {
     return withCorrelationId(request, new NextResponse(null, { status: 400 }));
   }
   ```

   Every later use in that function (`isProviderWebhookRoute`, `isSiteGateExempt`, `resolveSiteGateRedirectPath`, `resolveSiteGateRedirectSource`, `isProtectedRoute`, `shouldBypassClerkMiddleware`) then receives the decoded path. `anonymousAuthUrl` (`src/proxy.ts:76`) is a policy input too: it picks sign-up over sign-in with `resolveAnonymousAuthPath(request.nextUrl.pathname)`, so with the raw path a signed-out visitor to `/%70lans/new` would land on sign-in instead of sign-up. Give it the decoded path: change `ProtectRequest` to `(pathname: string) => Promise<NextResponse | undefined>`, have `handleProxyRequest` pass its `pathname` to `protectRequest(pathname)` at line 151, and make both callbacks (lines 166 and 196) call `anonymousAuthUrl(request, pathname)`, which uses `pathname` for `resolveAnonymousAuthPath` only. The `redirect_url` it builds keeps `request.nextUrl.pathname + search` as today: that value round-trips through the auth page back to the proxy, which decodes it again on the next request.

3. In `config.matcher` (`src/proxy.ts:205`), add a third entry so every protected prefix goes through the proxy whatever its extension:

   ```ts
   '/(dashboard|plans|account|settings|analytics)(.*)',
   ```

   This mirrors the existing `'/(api|trpc)(.*)'` entry. Keep the first entry as is; `robots.txt`, `sitemap.xml`, and `public/` assets stay excluded. The prefix list must match `PROTECTED_PREFIXES` in `middleware-policy.ts`; add a comment pointing at it.

4. Extend `scripts/launch/check-gate.ts` and the "Gate probe" section of `docs/testing/launch-smoke-checklist.md`: add `/plans/x.txt` to the `--expect on` checks (must redirect to `/waitlist`; it proves the matcher change, since the proxy did not run for it before), and add `/%64ashboard` to the `--expect off` checks (must redirect to `/auth/sign-in`). A gate-on check for `/%64ashboard` would be tautological, because the gate redirects every non-exempt path with or without normalization. The gate-off check is the one that shows normalization reached `isProtectedRoute`: before the change it answers 404 (Next does not decode) or 200 (the platform decoded it and the proxy missed it); after the change it is always the sign-in redirect. One prerequisite: `httpProbe` in `check-gate.ts` sends Node's default `Accept: */*`, and Clerk's `auth.protect()` answers **404** instead of redirecting when a request carries neither `Accept: text/html` nor `Sec-Fetch-Dest: document` (`@clerk/nextjs` 7.9.20, `dist/esm/server/protect.js`, `isPageRequest`). Add `headers: { accept: 'text/html' }` to the probe's `fetch` call. Without it the new check cannot pass, and the existing `--expect off` check "`/plans/new` (signed out) redirects to `/auth/sign-up`" cannot pass either, which matters on flag-off night.

**Tests.**

- New `tests/unit/lib/proxy-normalize-pathname.spec.ts`: `/%64ashboard` → `/dashboard`; `/%61pi/v1/plans` → `/api/v1/plans`; `/plans/%E2%9C%93` → `/plans/✓`; `/%2564ashboard` → `/%64ashboard` (single decode); `/%ZZ` → `null`; `/dashboard` unchanged.
- Extend `tests/unit/lib/proxy-matcher.spec.ts`: `/plans/x.txt`, `/dashboard/report.csv`, `/settings/x.html` → `true`; `/robots.txt`, `/landing.txt` → `false`.
- New `tests/unit/lib/proxy.spec.ts` that imports the default export of `@/proxy` and drives `handleProxyRequest` through the no-Clerk branch (mock `@/lib/config/env` so `appEnv.isDevelopment` is `true` and `shouldUseClerkMiddleware` returns `false`; mock `@/lib/proxy/site-gate` to return `null`, so the site gate is off and the sign-in check decides). Assert: `GET /%64ashboard` → 307 to `/auth/sign-in?redirect_url=...` (before the change this request passes through with `NextResponse.next()`, so the test fails on the old code); `GET /%61pi/v1/plans` → 307 to `/auth/sign-in`; `GET /%70lans/new` → 307 to `/auth/sign-up` (proves the auth-path choice sees the decoded path); `GET /%ZZ` → 400; `GET /landing` → passes through. Do not assert through a gate-on case: with a gate on, every non-exempt path redirects whether or not it was normalized. `@clerk/nextjs/server` must be mocked so the module loads in Vitest (`clerkMiddleware: () => () => new Response()`). If mocking proves awkward, export `handleProxyRequest` for tests instead; prefer the first.

**Risk.** Low. Decoding once matches Next's own param decoding. A 400 for undecodable paths replaces a Next 404 and only affects malformed URLs. The new matcher entry adds CSP and the gate to `/plans/*.txt`-style URLs that no legitimate link uses.

### A2. Lead 4: same-origin and content-type checks on mutating routes

**Claim.** Mutating routes authenticate only through the Clerk session cookie and check neither `Origin`, `Sec-Fetch-Site`, nor `Content-Type`; `parseJsonBody` accepts a `text/plain` body. A cross-site page could delete a user's plans if the browser sends the cookie.

**Evidence.**

- All authenticated routes go through `requestBoundary.route` → `withAuth` (`src/lib/api/request-boundary.ts:94`, `src/lib/api/auth.ts:178`). No route under `src/app/api` calls `withAuth` directly. There is no origin or content-type check anywhere on that path. `clerkMiddleware` at `src/proxy.ts:160` sets no `authorizedParties`.
- `parseJsonBody` (`src/lib/api/parse-json-body.ts:130`) calls `req.json()` or decodes the bytes it read; it never looks at `Content-Type`. Every mutating route that reads a body uses it in `required` mode: `plans/bulk-delete`, `plans/[planId]/regenerate`, `user/profile`, `user/free-access-plan`, `user/preferences`, `user/preferences/notifications`, `internal/maintenance/notifications/email`, and `createPlanRequest` for `POST /api/v1/plans`.
- Clerk documents that it sets `SameSite=Lax` on all of its session cookies ([Clerk CSRF protection](https://clerk.com/docs/guides/secure/best-practices/csrf-protection)). With `Lax`, a browser does not attach the cookie to a cross-site `POST`, so plain CSRF from another site does not reach these routes. Clerk also says that because `Lax` cookies ride on top-level navigations, "navigation alone should never trigger a mutation"; every mutating route here is `POST`, `PUT`, `PATCH`, or `DELETE`, so that holds.
- What `Lax` does not cover: a request from another host under the same registrable domain (`*.atlaris.app`) is same-site, so its cookies are sent. The hosts I could identify are the jobs Worker hostnames (JSON API only) and the mail sending domain (no web content). Neither serves attacker-controlled HTML. [B3](#b3-__session-cookie-attributes-lead-4) confirms the attributes and the host list on production.

**Decision.** Treat as hardening and do it before launch. It is cheap, removes the dependency on a cookie attribute that could change with a Clerk or domain setting, and closes the `text/plain` path.

**Fix.**

1. Add `src/lib/api/request-origin.ts`:

   ```ts
   import { ForbiddenError } from '@/lib/api/errors';

   const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

   function requestHost(req: Request): string | null {
     // Vercel sets x-forwarded-host identical to host (docs: request headers).
     return req.headers.get('x-forwarded-host') ?? req.headers.get('host');
   }

   /**
    * Browser-origin check for mutating requests. Prefers Sec-Fetch-Site (set by
    * every current browser, never by a page), then falls back to Origin. A
    * request with neither header is not from a browser and passes; the session
    * cookie is still required by withAuth.
    */
   export function assertSameOriginMutation(req: Request): void {
     if (SAFE_METHODS.has(req.method.toUpperCase())) return;

     const fetchSite = req.headers.get('sec-fetch-site');
     if (fetchSite !== null) {
       if (fetchSite === 'same-origin' || fetchSite === 'none') return;
       throw new ForbiddenError('Cross-origin request rejected.');
     }

     const origin = req.headers.get('origin');
     if (origin === null) return;
     let originHost: string;
     try {
       originHost = new URL(origin).host;
     } catch {
       throw new ForbiddenError('Cross-origin request rejected.');
     }
     if (originHost !== requestHost(req)) {
       throw new ForbiddenError('Cross-origin request rejected.');
     }
   }
   ```

   `same-site` is rejected on purpose: no sibling host legitimately calls these routes. `Origin: null` fails the URL parse and is rejected. Use a distinct error code (`CROSS_ORIGIN_REQUEST`, status 403) if the error contract needs to tell it apart from other `FORBIDDEN` responses; otherwise `ForbiddenError` is enough.

2. Call it in `withAuth` (`src/lib/api/auth.ts:178`) as the first statement of the returned handler, before `requireUser()`, in both the test and the production branch. This covers every authenticated route, including any future direct `withAuth` route. Server Actions are not affected (Next already enforces an `Origin` check for them). Internal worker routes, the Clerk webhook, and the unsubscribe route do not use `withAuth`, so machine callers are untouched.

3. In `parseJsonBody` (`src/lib/api/parse-json-body.ts`), require a JSON media type whenever a body is being parsed:

   ```ts
   function hasJsonMediaType(req: Request): boolean {
     const mediaType = (req.headers.get('content-type') ?? '')
       .split(';')[0]
       .trim()
       .toLowerCase();
     return mediaType === 'application/json';
   }
   ```

   In `required` mode, throw `new AppError('Unsupported media type', { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' })` when `hasJsonMediaType(req)` is false, before reading the body. In `optional` mode, apply the same check only when `detectBody(req)` says a body is present; a `POST` with no body and no content type still falls back as today. Document the 415 in `docs/api/error-contract.md`.

   Existing tests build requests without a content type and will start failing with 415 once this lands. `tests/integration/api/user-profile.spec.ts` has six `PUT` requests (lines 103-275) with `body: JSON.stringify(...)` and no header; `new Request`/`NextRequest` default such a body to `text/plain;charset=UTF-8`. Add `headers: { 'Content-Type': 'application/json' }` to each (the request at line 213 already has it), and sweep the rest before merging with `grep -rn -B6 "body: JSON.stringify" tests --include=*.ts | grep -vi content-type` to catch any other route test that hits a `parseJsonBody` route (`src/app/api/v1/user/preferences/route.ts`, the plans routes, and the email maintenance route also parse bodies; their specs already send the header, but re-check). Only route specs matter; `tests/unit/workers/jobs/signature.spec.ts` posts to the Worker, which does not use `parseJsonBody`.

   Callers verified to send `Content-Type: application/json` on every mutating fetch: `BulkDeletePlansDialog.tsx`, `DeletePlanDialog.tsx` (no body), `FreeAccessPlanSelector.tsx`, `RegeneratePlanDialog.tsx`, `save-model-preference.ts`, `profile-client.ts`, `NotificationPreferencesForm.tsx`, `usePlanGenerationSession.ts`. `useModuleLessonGeneration.ts:288` sends `POST` with no body to a route that never parses one, so it is unaffected. Re-check this list with `grep -rn "method: '\(POST\|PUT\|PATCH\|DELETE\)'" src --include=*.ts --include=*.tsx` before merging. The manual maintenance route `POST /api/internal/maintenance/notifications/email` now needs `-H 'content-type: application/json'` from operators; add that to `docs/architecture/email-notification-delivery-runbook.md`.

4. `authorizedParties` on `clerkMiddleware`: do **not** add it in PR 1. It rejects session tokens whose `azp` claim is not in the list, so a wrong list signs everyone out. Add it only after [B3](#b3-__session-cookie-attributes-lead-4) confirms that `APP_URL` equals the browser origin on production and staging (and whether `www.atlaris.app` redirects or serves). The change is then one line in `src/proxy.ts:177`: `authorizedParties: appEnv.isDevelopment ? undefined : [appEnv.url]`, plus a note in `docs/development/environment.md`. Preview deployments get `NODE_ENV=production`, so they need `APP_URL` set to their own origin or the option gated on `VERCEL_ENV === 'production'`; check `src/lib/config/env/app.ts` before choosing.

**Tests.**

- New `tests/unit/lib/api/request-origin.spec.ts`: GET passes without headers; POST with `sec-fetch-site: same-origin` passes; `cross-site` and `same-site` throw 403; no `sec-fetch-site` and `origin` equal to `host` passes; `origin` with another host throws; `origin: null` throws; POST with neither header passes; `x-forwarded-host` wins over `host`.
- Extend `tests/unit/api/request-boundary.spec.ts` (the route tests at lines 120-340 already build `new Request('http://localhost/api', { method: 'POST' })`): a POST with `origin: https://evil.example` returns the canonical 403 body; a POST with `sec-fetch-site: same-origin` runs the handler.
- Extend `tests/unit/lib/api/parse-json-body.spec.ts`: `text/plain` body in required mode → 415 before the body is read (use a `ReadableStream` that records whether `read()` was called); `application/json; charset=utf-8` passes; optional mode with no body and no header still returns the fallback; optional mode with `content-length: 5` and `text/plain` → 415.

**Risk.** Low to moderate. The one behavior change for real clients is the 415 for non-JSON bodies. Playwright smoke tests drive the app through a browser (`Sec-Fetch-Site: same-origin`) and use the `request` fixture only for GET redirect checks, so they pass. Node scripts that call the API with an agent session send no `Origin`, so they pass. If any client is found sending `application/x-www-form-urlencoded`, fix the client, not the check.

### A3. Per-user AI spend cap

**Claim.** Nothing limits one user's total AI spend. The hourly limit (`PLAN_GENERATION_LIMIT = 10` per 60 minutes, `src/shared/constants/generation.ts:24`) allows up to 240 generations a day, and the per-plan ceiling (`PLAN_AI_BUDGET.ceilingUsdByTier`, `src/features/billing/plan-ai-budget.ts:12`) restarts with every plan.

**Evidence.** Confirmed by reading. Admission points that start paid work, none of which sums spend per user:

- `POST /api/v1/plans` (`src/app/api/v1/plans/route.ts:108`) and `POST /api/v1/plans/[planId]/retry` (`retry/route.ts:55`) call `checkPlanGenerationRateLimit` (hourly count only). `reserveAttemptSlot` in `src/lib/db/queries/attempts.ts:181` re-checks the same count inside the transaction.
- `POST /api/v1/plans/[planId]/regenerate` checks the monthly regeneration quota and the model policy, then dispatches to the Worker.
- `POST .../lesson-content/generate` claims the module; the Worker enforces only the per-plan ceiling (`src/features/lesson-content/run-module-lesson-generation-work.ts:185`).
- `ai_usage_events` keeps `user_id`, `provider_cost_microusd`, `cost_cents`, and `created_at`, survives plan deletion (`plan_id` is set null), and has the index `idx_ai_usage_events_user_created_at` (`supabase/schema/tables/usage.ts`). `plan_research.cost_microusd` is per plan and is deleted with the plan.

**Worst case today, per user per day** (per-plan ceiling × 240): Free about $12, Starter about $300, Pro about $600. The per-tier OpenRouter key limits recorded on 2026-10-21 ($10/day per tier) are the real backstop, and they stop every user on that tier, not the one who ran away.

**Fix.** Build only after Juan answers [B6](#b6-spend-cap-decisions); the code is the same for any numbers.

1. Constants in `src/features/billing/plan-ai-budget.ts`:

   ```ts
   /** Monthly AI spend ceiling per user (calendar month, UTC). See DEV-208. */
   export const USER_AI_BUDGET_USD_BY_TIER: Record<SubscriptionTier, number> = {
     free: 0.25,
     starter: 7.5,
     pro: 30,
   };
   export function userAiCeilingMicrousd(tier: SubscriptionTier): number;
   ```

   The values above are the recommendation from [B6](#b6-spend-cap-decisions); replace them with Juan's numbers.

2. Query in `src/lib/db/queries/plan-ai-budget.ts`: `sumUserAiSpendMicrousd(userId, since, dbClient)` summing `COALESCE(provider_cost_microusd, cost_cents * 10000)` from `ai_usage_events` where `user_id = $1 AND created_at >= $2`. Same expression as `sumPlanAiSpendMicrousd` at line 45, so the two ledgers agree.

   Do **not** join `plan_research.cost_microusd` into the user ledger. `plan_research.plan_id` cascades on delete (`supabase/schema/tables/plan-research.ts:31`), and a successful research run's cost is written only there (`saveResearchStep`, `workers/jobs/src/workflows/plan-generation/research.ts:127`; only a rejected attempt's cost reaches `ai_usage_events`, per the comment at line 100). Summing it would let a user reset the research part of their monthly spend by deleting the plan. Instead, make the research cost durable: in `saveResearchStep`, inside the same transaction as `insertPlanResearch` and behind the same `already_saved` guard, also insert one `ai_usage_events` row for a successful run (`user_id` from the plan owner, `provider: 'openrouter'`, the research model, the model call's token counts, `provider_cost_microusd = researched.costMicrousd`, `plan_id`). `recordUsageInTx` and `canonicalUsageToRecordParams` (already used by `recordDiscardedCallUsage` at line 78) do this if `ResearchStepResult` carries the run's canonical usage alongside `costMicrousd`; `run-research.ts:214` already has the model usage and search usage in hand. Then drop the `plan_research` term from `sumPlanAiSpendMicrousd` (line 56) so the per-plan ledger does not double count; `plan_research.cost_microusd` stays as the per-run record. Plans researched before this change lose their research cost from the per-plan ledger, which is acceptable pre-launch. If this is cut for time, keep the join out anyway and record in the PR that research spend is not yet capped per user; the exposure is one research run's cost per plan, bounded by the hourly plan limit.

3. Admission helper in `src/lib/api/rate-limit.ts` next to `checkPlanGenerationRateLimit`: `assertUserAiBudget(actor, dbClient)`. Window start is the first of the current UTC month (matches `usage_metrics.month`). On a query error, fail closed and log, exactly like the hourly limiter does at line 96. When spent ≥ ceiling, throw an `AppError` with status 429, code `AI_BUDGET_EXHAUSTED`, `classification: 'capped'`, and `details: { resetsAt }` (ISO string of the next month start). Add the code to `src/shared/constants/api-error-codes.ts` and to the table in `docs/api/error-contract.md`.

4. Call it right after the hourly check in the create and retry routes, before `requestPlanRegeneration` in the regenerate route, and before the claim in `createModuleLessonContentGenerateHandler` (`.../lesson-content/generate/handler.ts:27`). Do not add it inside the Worker: the Worker's per-plan ceiling still bounds a run that was admitted.

5. Client: `parseApiErrorResponse` already surfaces `error`; make the plan form and the lesson "generate" button show the message and the reset date for `AI_BUDGET_EXHAUSTED` the way they show the hourly 429 today. Find the existing 429 handling with `grep -rn "RATE_LIMIT\|retryAfter" src/features/plans src/app/\(app\)/plans`.

**Tests.**

- `tests/unit/lib/api/rate-limit.spec.ts` (or a new spec next to it): under ceiling passes; at ceiling throws 429 with `resetsAt` at the next UTC month; query error fails closed.
- `tests/integration/db/plan-ai-budget.spec.ts`: `sumUserAiSpendMicrousd` counts events with and without provider cost, ignores other users and earlier months, and keeps counting events whose plan was deleted (including the research row written by `saveResearchStep`).
- Extend `tests/unit/workers/jobs/plan-generation-workflow.spec.ts`: a successful research save inserts one `ai_usage_events` row with the research cost and plan id; a retry after `already_saved` inserts none; a skipped run (`costMicrousd: null`) inserts none.
- Route test for `POST /api/v1/plans` with a stubbed sum at the ceiling → 429 body with the code.

**Risk.** Moderate only if the numbers are wrong: a low ceiling blocks paying users, so the error message must say when it resets. Cost accuracy: DEV-185 fixed the grounded undercount, and grounded generation is off at launch, so the recorded costs are the provider-reported ones.

### A4. Lead 5: cap the signed request body and hash it once

**Claim.** `verifySignedRequest` (`workers/jobs/src/http/signature.ts:30`) checks headers and timestamp, then reads the whole body with `request.text()` (line 56) and hashes it once per candidate secret (`computeJobsSignature`, `src/lib/jobs-worker/contract.ts:158`) before returning 401. An anonymous client with a forged header can make the Worker buffer and hash an arbitrarily large body.

**Evidence.** Confirmed by reading. Cloudflare allows request bodies up to 100 MB on Free and Pro zones and gives each isolate 128 MB ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). A 100 MB `text()` plus two SHA-256 passes over it is enough to exhaust the isolate; concurrent commands in that isolate fail until it restarts. Routes: `/v1/regeneration/enqueue`, `/v1/module-lessons/start`, `/v1/plan-generation/start`, `/v1/email-delivery/runs` (`workers/jobs/src/index.ts:100-140` and the three handlers under `workers/jobs/src/http/`).

**Fix.**

1. In `src/lib/jobs-worker/contract.ts`, add `export const JOBS_SIGNED_BODY_MAX_BYTES = 256 * 1024;` and split the signature helper so the body is hashed once:

   ```ts
   export async function hashJobsBody(body: string): Promise<string>; // hex sha256
   export async function computeJobsSignatureFromBodyHash(input: {
     secret: string;
     timestamp: string;
     method: string;
     path: string;
     bodyHash: string;
   }): Promise<string>;
   // keep computeJobsSignature as a wrapper: hashJobsBody then the function above
   ```

   Measure the largest real command body before merging: build a `PlanGenerationStartCommand` from a maximal `parseCreatePlanRequest` input in a test and assert it is well under the limit. The audit reports bodies under 64 KiB; 256 KiB leaves room.

2. In `verifySignedRequest`, after the timestamp check:
   - Parse `content-length`. If it is a finite number above `JOBS_SIGNED_BODY_MAX_BYTES`, return `{ ok: false, reason: 'body_too_large' }` without touching the body.
   - Read the body through a capped reader (new `workers/jobs/src/http/body.ts`, same loop as `readBodyCapped` in `src/lib/api/parse-json-body.ts:78`, returning `null` once the running total passes the limit and cancelling the stream). `null` → `{ ok: false, reason: 'body_too_large' }`.
   - Compute `bodyHash` once, then one HMAC per candidate secret. Keep the "check every candidate" loop so timing stays uniform.
   - Extend the result type: `{ ok: false; reason: 'unauthorized' | 'body_too_large' }`. The four call sites map `body_too_large` to a `413` with an empty body and everything else to `unauthorizedResponse()`.

**Tests** (`tests/unit/workers/jobs/signature.spec.ts`, which already has `signedRequest` and secret fixtures):

- A request with `content-length` above the limit is rejected with `body_too_large` and its body stream is never read (pass a `ReadableStream` whose `pull` sets a flag).
- A request without `content-length` whose stream yields more than the limit is rejected and the stream is cancelled.
- A valid request at exactly the limit is accepted and returns the signed body.
- A valid request during rotation (both secrets set) calls `crypto.subtle.digest` on the body once (spy on `globalThis.crypto.subtle.digest` and count calls with the body's byte length).
- Existing cases keep passing; `tests/unit/lib/jobs-worker/client.spec.ts` still passes because the client keeps calling `computeJobsSignature`.

**Risk.** Low. The only behavior change for legitimate traffic is a hard ceiling far above real bodies. Confirm the ceiling with the measurement test. Also ask Juan to confirm the Cloudflare rate-limit rule on `/v1/*` from the B1 checklist exists ([B5](#b5-cloudflare-limits-lead-5)).

### A5. Lead 7: let a retried `claim-run` step re-enter its own run

**Claim.** In `claimRun` (`workers/jobs/src/workflows/email-delivery/run.ts:266`), a scheduled firing reserves the `(run_kind, scheduler_date_utc)` row, then `claimEmailNotificationDeliveryRun` sets it `running` with this instance's `workflowRunId`. If the step throws after that update committed (a dropped connection on the way back, a logger or metric failure in `logRunEvent`/`countMetric` at lines 320-326), Workflows retries the step. Attempt 2 calls `reserveEmailNotificationDeliveryRun` again, gets `outcome: 'existing'` with `status: 'running'`, fails the `unclaimedQueued` test at line 295, and returns `{ kind: 'duplicate' }` (line 307). The workflow exits at line 659; no page step runs; the row stays `running` forever; that day's emails do not go out.

**Evidence.** Confirmed by reading. `deps.withDb` is a connection scope, not a transaction, so the claim update commits on its own. The claim query itself is safe to replay: `attachEmailNotificationWorkflowRun` (`src/lib/db/queries/email-notification-delivery-runs.ts:149`) returns `claimed` for a `running` row whose `workflowRunId` matches (lines 180-185). Only the reservation branch in `claimRun` blocks the replay. No recovery path exists for a `running` row with a dead instance: `prepareEmailNotificationDeliveryRunResume` accepts only `failed`, `paused`, and `needs_review`.

**Fix.** In `claimRun`, treat a row this instance already owns as claimable:

```ts
const ownedByThisRun =
  reservation.run.status === 'running' &&
  reservation.run.workflowRunId === workflowRunId;
if (reservation.outcome === 'existing' && !unclaimedQueued && !ownedByThisRun) {
  // duplicate_invocation ...
}
```

Everything else is unchanged: the code falls through to `claimEmailNotificationDeliveryRun`, which returns `claimed` via its replay branch, and the workflow proceeds to `page-1`. Log the replay as `run_claimed` with an `attempt` field so it is visible.

Add an operator recovery to `docs/architecture/email-notification-delivery-runbook.md` for rows this bug already left behind: find `running` rows with `updated_at` older than an hour whose Workflow instance is not live, set them `failed` with `last_error_class = 'operator_reset'`, then send the `resume` command. Juan checks production for such rows ([B9](#b9-email-run-rows-stuck-in-running-lead-7)).

**Tests** (`tests/unit/workers/jobs/email-delivery-workflow.spec.ts`, which has `createStep` retries and the `runs.*` mocks):

- New case "re-enters its own run when the claim committed and the step failed": `runs.reserve` returns `reserved`; `runs.claim` returns `claimed`; make `deps.logger.info` throw once on the `run_claimed` event so attempt 1 fails after the claim; on attempt 2, `runs.reserve` returns `existing` with `status: 'running'` and `workflowRunId` equal to the instance's; `runs.claim` returns `claimed`. Assert the result is not `duplicate`, `page-1` ran, and `runs.reserve` was called twice.
- Keep "exits a duplicate firing without claiming or sending" (line 316) passing: a `running` row owned by another `workflowRunId` is still a duplicate.

**Risk.** Low. The condition only admits a row carrying this instance's own ID.

### A6. Lead 8: pin the react-doctor workflow actions

**Claim.** `.github/workflows/react-doctor.yml` uses `actions/checkout@v5` and `millionco/react-doctor@v2`, both mutable tags, in a job with `pull-requests: write`, `issues: write`, and `statuses: write`.

**Evidence.** Confirmed. Resolved on 2026-11-05 with `git ls-remote --tags`:

| Action                   | Tag                                                     | Commit                                     | Version |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------ | ------- |
| `actions/checkout`       | `v5`                                                    | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | v5.1.0  |
| `actions/checkout`       | already pinned in `dependency-security-remediation.yml` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1  |
| `millionco/react-doctor` | `v2` (annotated; peeled)                                | `695e46eee203a5d1855020191aa7e9c010a1250e` | v2.4.0  |

The action's `action.yml` (read at `v2`) uses `issues.createComment/updateComment` (sticky summary), `pulls.listFiles/createReview/deleteReviewComment` (inline comments), and `repos.createCommitStatus` (commit status, "skipped with a warning" without `statuses: write`). It does not use the Checks API. So the current permission block is already the minimum for what the action does.

**Fix.**

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    fetch-depth: 0
- uses: millionco/react-doctor@695e46eee203a5d1855020191aa7e9c010a1250e # v2.4.0
```

Use the v7.0.1 checkout pin the other workflow already uses, for one version across the repo. If the v7 bump causes trouble, fall back to `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0`. Optional narrowing: React Doctor is not a required check, so set `with: commit-status: false` and drop `statuses: write`. Verify by watching the workflow run on the PR.

**Risk.** None beyond the checkout major bump, which the other workflow has already taken. The repo-level SHA-pinning policy is a GitHub setting for Juan ([B10](#b10-github-settings-lead-8)).

### A7. Lead 6: tie lesson writes to the owning workflow run (post-launch)

**Claim.** A grounded lesson run that outlasts the 15-minute cleanup (`ORPHANED_MODULE_LESSON_GENERATION_THRESHOLD_MS`, `src/features/plans/cleanup.ts:38`; cron `*/15 * * * *` in `workers/jobs/cloudflare.config.ts:154`) gets its module failed by cleanup; its success commit then matches zero rows and rolls back, so billed usage is never recorded; a retry can then spend on the same module twice.

**Evidence.** Plausible by reading. `markModuleLessonProviderStarted` and `commitModuleLessonBatchSuccess` (`src/lib/db/queries/module-lesson-generation.ts:226`, `:540`) guard on status and claim, not on `workflow.runId`. The failure path in `workers/jobs/src/workflows/module-lessons/run.ts:506` already checks `metadata?.workflow?.runId !== run.instanceId`, so the pattern exists. `groundedGeneration` defaults `false` (`src/flags.ts:236`) and stays off through launch (DEV-163), so this path should not run before launch.

**Decision.** Defer to post-launch with DEV-163 after Juan confirms the flag is off in production ([B11](#b11-grounded-generation-flag-lead-6)).

**Fix outline for later.** Add `workflowRunId` to the `where` of `markModuleLessonProviderStarted`, `commitModuleLessonBatchSuccess`, and `commitModuleLessonGenerationFailure` (compare `lesson_generation_metadata->'workflow'->>'runId'`), return a `not_owned` outcome instead of throwing, and record usage in its own idempotent insert keyed on `request_id` before the status-guarded transaction so a lost race still bills correctly. Tests: claim as run A, backdate `providerStartedAt` by 20 minutes, run cleanup, call the success commit, assert `not_owned` and that usage was still recorded once; re-claim as run B and assert run A's marker is rejected.

### A8. `postgres-js` edge cases: accept and watch

Two behaviors seen while testing PR 930 in `createRlsConnection` (`supabase/rls.ts:79`, `postgres` 3.4.9): an uncaught `TypeError: Cannot read properties of null (reading 'write')` when a connection dies mid-transaction, and a short-lived leaked owner connection (up to the 300-second idle timeout) when a query is queued at that moment. Neither exposes data; the client has already ended and queued queries reject.

**Decision.** Accept for launch. Add a Sentry alert rule on that error message and watch the Supabase connection count for the first week. Revisit with a driver upgrade post-launch (check the `postgres` changelog for the null-write fix before bumping). Juan creates the alert ([B12](#b12-sentry-alert-postgres-js)).

---

## Part B: Juan's hands

Do not paste secret values anywhere. Each item says what it settles and what to record in DEV-208.

### B1. Encoded-path probe on staging (lead 3)

After PR 1 deploys to staging with the waitlist or maintenance gate on, run from the MacBook:

```bash
pnpm launch:check-gate --expect on --base-url https://<staging-host>
```

With the new checks from A1, `/plans/x.txt` must redirect to the gate page. The encoded-path question needs the gate **off**, because with it on every non-exempt path redirects whether or not it was decoded. So also run, on staging with the gate off (or against production after the flag-off), signed out:

```bash
curl -sS -o /dev/null -H 'accept: text/html' -w '%{http_code} %{redirect_url}\n' https://<host>/%64ashboard
```

The `accept: text/html` header is required: without it Clerk's `auth.protect()` returns 404 for a signed-out request instead of the sign-in redirect, which would make the "after" result indistinguishable from the "before" one.

Before PR 1: `404` means Vercel passes the encoded path through and Next does not decode it, so lead 3 is hardening only; `200` means Vercel routed it to `/dashboard` while the proxy saw `/%64ashboard`, which upgrades lead 3 to a real finding (fixed by the same PR). After PR 1 it must be a `307` to `/auth/sign-in` in both cases; the `--expect off` run of the gate probe asserts that. Record the status codes before and after.

### B2. `rolbypassrls` on the app role (leads 1 and 2, informational)

From the MacBook with the 1Password-injected production non-pooling URL (`createRlsConnection` uses `POSTGRES_URL_NON_POOLING` first, `supabase/rls.ts:83`):

```bash
op run -- psql "$POSTGRES_URL_NON_POOLING" -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
```

Expected: `rolbypassrls = true`. That is by design (`supabase/rls.ts:36`): the owner role connects, then `SET ROLE authenticated` drops the bypass. PR 930 made a lost connection fail closed instead of reconnecting as the owner. Record the value and whether the URL is the direct host or the pooler. Also confirm the PR 930 production migration ran after the next `develop` → `main` promotion (Supabase dashboard → Database → Migrations).

### B3. `__session` cookie attributes (lead 4)

1. Sign in on production in a browser, open DevTools → Application → Cookies → `https://atlaris.app`. For `__session` and `__client_uat`, record `Domain`, `SameSite`, `Secure`, and `HttpOnly`. Expected from Clerk's docs: `SameSite=Lax`, `Secure`.
2. Clerk Dashboard → Configure → Domains: list satellite domains (expected none) and the allowed origins.
3. List every host under `atlaris.app` that serves anything (DNS zone in Cloudflare). Expected: the app, the jobs Worker hostnames, the mail domain. If any host could serve user- or third-party-controlled HTML, say so.
4. Record `APP_URL` for production, staging, and preview (names and whether they match the browser origin). This decides the `authorizedParties` step in A2.

Decision rule: `Lax` or `Strict`, no satellite, no hostile same-site host → A2 is hardening and lead 4 closes as "not a finding". Anything else → lead 4 is real and A2 is the fix.

### B4. Vercel headers (settled)

Vercel documents: "If you are trying to use Vercel behind a proxy, we currently overwrite the `X-Forwarded-For` header and do not forward external IPs. This restriction is in place to prevent IP spoofing." `x-real-ip` is "identical to the `x-forwarded-for` header" ([Vercel request headers](https://vercel.com/docs/headers/request-headers)). App records are DNS-only in Cloudflare per `docs/architecture/cloudflare-b1-checklist.md`, so no Cloudflare hop rewrites them and `cf-connecting-ip` is never present. `getClientIp` in `src/lib/api/ip-rate-limit.ts` reads the leftmost `X-Forwarded-For`, which on Vercel is the client. No change. One check: confirm in the Cloudflare DNS table that the apex and `www` records still show the grey cloud.

### B5. Cloudflare limits (lead 5)

Cloudflare dashboard → the `atlaris.app` zone → Network: record "Maximum Upload Size" (100 MB on Free and Pro). Security → WAF → Rate limiting rules: confirm the one `/v1/` rule from the B1 checklist exists and is enabled. Record both.

### B6. Spend cap decisions

Answer these in DEV-208 and PR 2 starts:

1. **Cap before launch?** Recommendation: yes if the answers below arrive by 2026-11-10; otherwise the provider key limits carry launch week and PR 2 lands right after.
2. **Dollar limits per tier, per calendar month (UTC).** Recommendation: Free $0.25, Starter $7.50, Pro $30. Starter and Pro are the 30% hard stop from the 2026-10-21 notes; Free covers the one lifetime initial plan plus lesson generation with margin. A daily sub-cap is not recommended; the per-tier OpenRouter key limits already act as the daily backstop.
3. **Window.** Recommendation: calendar month, same as `usage_metrics.month`. Billing anchors differ per user and are not worth the complexity now.
4. **What the user sees.** Recommendation: a 429 with "You've reached this month's AI budget. It resets on <date>." on the plan form and the lesson generate button, and nothing else changes.

Also confirm the current provider caps, since the code design assumes they exist: OpenRouter dashboard → Keys → per-key limits for each tier key (notes from 2026-10-21 say $10/day per tier and a $50 prepaid balance); Parallel account → spend limit. Record the current values. Top up OpenRouter before 2026-11-12 (per the project memory).

### B7. Active-plan cap (confirm the intent)

`TIER_LIMITS` (`src/shared/constants/tier-limits.ts`): Free 1, Starter 10, Pro unlimited active plans. Deleting a plan frees a slot, so the cap bounds plans held, not plans generated; the hourly limit and the spend cap bound generation. Confirm that is intended at launch. No code either way.

### B8. Production environment values

From the MacBook: `vercel env ls production` (names only). Confirm these names exist: `MAINTENANCE_WORKER_TOKEN`, `WORKER_HEALTH_TOKEN`, `APP_URL`, `LAUNCH_WAITLIST` (fail-safe, `true` until launch), and that `NODE_ENV` is **not** set by hand. The code reads `isProduction` as `NODE_ENV === 'production'` (`src/lib/config/env/shared.ts:80`), which Vercel sets on preview, staging, and production, and `assertInternalWorkerAccess` (`src/lib/api/internal/internal-worker-access.ts:104`) fails closed there when a token is missing. The fail-open branch only runs in development and test. So the only risk is an overridden `NODE_ENV`; confirm it is absent and record that.

### B9. Email run rows stuck in `running` (lead 7)

Supabase SQL editor on production:

```sql
select id, run_kind, scheduler_date_utc, workflow_run_id, updated_at
from email_notification_delivery_runs
where status = 'running' and updated_at < now() - interval '1 hour'
order by updated_at;
```

Also search Workers Logs for `duplicate_invocation` entries whose `workflowRunId` matches a `run_claimed` entry. Any hit confirms lead 7 happened in production; recover with the runbook steps from A5 after PR 1 ships.

### B10. GitHub settings (lead 8)

Optional: repository Settings → Actions → General → "Require actions to be pinned to a full-length commit SHA". React Doctor is not a required check on `main` or `develop` (checked 2026-11-04), so nothing else changes.

### B11. Grounded generation flag (lead 6)

Flagship dashboard → `grounded-generation` → confirm it is Off for every tier in production. If it is, record that and move lead 6 to DEV-163.

### B12. Sentry alert (postgres-js)

Sentry → Alerts → new issue alert on the production project for events whose message contains `Cannot read properties of null (reading 'write')`. Then watch Supabase → Database → connections for the first week after launch.

### B13. Supabase Data API

The app never uses PostgREST: every query goes through the owner connection with `SET ROLE` (`supabase/rls.ts`), and RLS predicates read the app-set `request.jwt.claims` (`supabase/schema/tables/common.ts:7`). All 27 tables enable RLS, but migration `0031_grant_rls_role_privileges.sql` grants `SELECT` on every public table to `anon`, so a hosted Data API with the anon key is a surface nobody needs. Supabase Dashboard → Project Settings → API → Data API Settings → turn **Enable Data API** off ([Hardening the Data API](https://supabase.com/docs/guides/api/hardening-data-api)). Do it on staging first, run the smoke checklist, then production. Record the before and after state. If something does depend on it, the fallback from the same page is to remove `public` from the exposed schemas.

---

## Evidence log

- Repo state read: `origin/develop` `892ca05` on 2026-11-05. PR 930 is `8d98b44`. Audit references were checked against the files named in each section; line numbers are from this revision.
- Next probe: Next 16.4.3 from the lockfile, `next dev --webpack` and `next build && next start`, requests sent with `curl`; results in A1. The probe app was not committed.
- Action pins: `git ls-remote --tags` against `actions/checkout` and `millionco/react-doctor` on 2026-11-05; `millionco/react-doctor` `action.yml` read at tag `v2`.
- Docs cited: Clerk CSRF protection and cookies pages; Vercel request headers; Cloudflare Workers limits; Supabase "Hardening the Data API" (API Settings → Data API Settings → "Enable Data API" off, which is what the Supabase check in DEV-208 needs: `api.enabled=false` in `supabase/config.toml` is local only, and migration `0031` grants `SELECT` on all tables to `anon`, so the hosted toggle is the control).
